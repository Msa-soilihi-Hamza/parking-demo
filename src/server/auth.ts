import { waitUntil } from "@vercel/functions";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendVerificationCode } from "@/server/mailer";
import { appUrl } from "@/server/stripe";

// Customer accounts (Better Auth): sign in with a 6-digit code sent by e-mail, no
// password, or with Google. The team spaces keep their own access codes.

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
    // Lets server actions set the session cookie; must stay last (Better Auth docs).
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
