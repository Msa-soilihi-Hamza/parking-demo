import { waitUntil } from "@vercel/functions";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, emailOTP } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { ac, roles } from "@/lib/permissions";
import { activeBookingOf, anonymizeBookingsOf } from "@/server/account-deletion";
import { sendAccountDeletionLink, sendVerificationCode } from "@/server/mailer";
import { codeSendAllowed } from "@/server/otp-budget";
import { appUrl } from "@/server/stripe";

// Accounts (Better Auth): sign in with a 6-digit code sent by e-mail, no password, or
// with Google. Customers and the team use the same sign-in; a role opens team spaces.

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    : null;

/** Google sign-in only shows when its keys are set (it needs Google Cloud credentials). */
export const googleEnabled = google !== null;

export const auth = betterAuth({
  // Without it, Google's callback could point at localhost in production.
  baseURL: appUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: google ? { google } : {},
  // Better Auth routes the site never calls: closed, so they cannot be used either
  // (other ways to check a code, password reset, account linking, profile edits).
  disabledPaths: [
    "/email-otp/check-verification-otp",
    "/email-otp/verify-email",
    "/email-otp/request-password-reset",
    "/forget-password/email-otp",
    "/email-otp/reset-password",
    "/update-user",
    "/link-social",
    "/unlink-account",
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/email-otp/send-verification-otp") return;
      // The site only signs in with a code: no other kind of code is sent.
      if (ctx.body?.type !== "sign-in") {
        throw new APIError("BAD_REQUEST", { message: "Type de code non pris en charge." });
      }
      // Each new code gets 5 tries: without a cap per address, asking again and again
      // (from many IPs) would let someone keep guessing an account's code.
      if (!(await codeSendAllowed(String(ctx.body.email ?? "")))) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: "Trop de codes demandés pour cette adresse. Réessayez dans une heure.",
        });
      }
    }),
  },
  user: {
    // The customer can delete their account from "Mon espace", confirmed by an e-mail link.
    deleteUser: {
      enabled: true,
      // Without this, deletion would be immediate: the e-mail proves it is really them.
      async sendDeleteAccountVerification({ user, url }) {
        await sendAccountDeletionLink(user.email, url);
      },
      async beforeDelete(user) {
        const active = await activeBookingOf(user);
        if (active) {
          throw new APIError("BAD_REQUEST", {
            message: `Réservation en cours (${active}) : vous pourrez supprimer votre compte après votre retour.`,
          });
        }
        // Before the account row goes: deleting it empties bookings.user_id (ON DELETE
        // SET NULL), and the bookings could then only be found by e-mail.
        await anonymizeBookingsOf(user);
      },
    },
  },
  // On Vercel each function has its own memory: counters live in the database.
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      // A code e-mail costs us a send and fills someone's inbox: 3 per minute.
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/email-otp": { window: 60, max: 10 },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      // Only a hash in the database, as before.
      storeOTP: "hashed",
      // Not awaited (the docs: avoids timing attacks); waitUntil keeps the send alive on Vercel.
      async sendVerificationOTP({ email, otp }) {
        waitUntil(
          sendVerificationCode(email, otp).catch((error) => console.error("Sign-in code e-mail failed", error)),
        );
      },
    }),
    // Team roles: chauffeur, accueil, responsable (all rights). Set directly in the
    // database by scripts/create-staff.ts, never chosen at sign-up.
    admin({ ac, roles, defaultRole: "user", adminRoles: ["responsable"] }),
    // Lets server actions set the session cookie; must stay last (Better Auth docs).
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
