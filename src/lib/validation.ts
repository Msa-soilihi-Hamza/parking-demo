import { z } from "zod";
import { normalizeReference, normalizeSpot } from "@/lib/arrival";
import { PICKUP_STATUSES } from "@/lib/pickup";
import { MAX_VALIDITY_DAYS, normalizePromoCode } from "@/lib/promo";
import { parisLocalToDate } from "@/lib/time";

// One Zod schema per form, shared by the browser (errors shown at once, nothing sent)
// and the Server Action (the check that counts: an action can be called without the
// page). Every text has a maximum length, and no invisible characters.

export const REVIEW_MAX_LENGTH = 500;

/** Control characters, zero-width and bidi characters: nobody types them on purpose. */
const HIDDEN_CHARS = /[\p{Cc}​-‏‪-‮⁠-⁤⁦-⁩﻿]/u;
/** The same, but line breaks and tabs are allowed (a review). */
const HIDDEN_CHARS_MULTILINE = /[^\P{Cc}\n\r\t]|[​‎‏‪-‮⁦-⁩﻿]/u;
const tooLong = (max: number) => `${max} caractères au maximum.`;

/** A line of free text: normalized, trimmed, limited. */
function singleLine(max: number) {
  return z
    .string()
    .normalize("NFC")
    .trim()
    .max(max, tooLong(max))
    .refine((v) => !HIDDEN_CHARS.test(v), "Caractères non autorisés.");
}

/** "" → null, for optional fields. */
const emptyToNull = (v: string | undefined) => v || null;

const localDateTime = (message: string) =>
  z
    .string()
    .max(16, message)
    .transform((value, ctx) => {
      const date = parisLocalToDate(value);
      if (!date) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return date;
    });

const personName = (missing: string) =>
  z
    .string()
    .normalize("NFC")
    .trim()
    .min(2, missing)
    .max(80, tooLong(80))
    .regex(/^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u, "Lettres, espaces, tirets et apostrophes uniquement.");

const phone = z
  .string()
  .trim()
  .max(20, "Numéro de téléphone invalide.")
  .regex(/^\+?[\d\s.()-]+$/, "Numéro de téléphone invalide.")
  // E.164: at most 15 digits; a French number has 10.
  .refine((v) => /^(\D*\d){8,15}\D*$/.test(v), "Numéro de téléphone invalide.");

/** French or foreign plate: letters, digits, dashes and spaces. */
const plate = z
  .string()
  .trim()
  .toUpperCase()
  .max(12, "Plaque invalide.")
  .regex(/^[A-Z0-9][A-Z0-9 -]{2,10}[A-Z0-9]$/, "Plaque invalide : lettres, chiffres et tirets.");

const parkingSlug = z.string().regex(/^[a-z0-9-]{1,40}$/, "Choisissez un parking.");

/** "inconnu" or empty → null; the server checks it is one of the parking's terminals. */
const optionalTerminal = z
  .string()
  .max(40)
  .optional()
  .transform((v) => (v && v !== "inconnu" ? v : null));

const passengers = z.coerce
  .number({ error: "Entre 1 et 8 passagers." })
  .int("Entre 1 et 8 passagers.")
  .min(1, "Entre 1 et 8 passagers.")
  .max(8, "Entre 1 et 8 passagers.");

const spot = z
  .string()
  .max(20, "Place invalide : lettres et chiffres, par exemple B12.")
  .transform((value, ctx) => {
    const normalized = normalizeSpot(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Place invalide : lettres et chiffres, par exemple B12." });
      return z.NEVER;
    }
    return normalized;
  });

const reference = z
  .string()
  .max(40, "Référence invalide : elle ressemble à ESC-AB12CD.")
  .transform((value, ctx) => {
    const normalized = normalizeReference(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Référence invalide : elle ressemble à ESC-AB12CD." });
      return z.NEVER;
    }
    return normalized;
  });

/** The secret part of a customer's link (base64url, or "demo-retour" for the demo). */
export const accessToken = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Réservation introuvable.");

export const email = z.email("Adresse e-mail invalide.").max(254, "Adresse e-mail invalide.");

// --- Customer -----------------------------------------------------------------

/** The e-mail that receives the sign-in code (Better Auth checks it again). */
export const signInEmailSchema = z.object({ email: z.string().trim().pipe(email) });

/** The live price on the booking form (called by the page, but callable by anyone). */
export const quoteInputSchema = z.object({
  parking: parkingSlug,
  dropoffAt: localDateTime("Choisissez vos dates."),
  returnAt: localDateTime("Choisissez vos dates."),
  promoCode: z.string().max(40).optional(),
});

// No e-mail field: it comes from the signed-in account, already verified.
export const bookingDetailsSchema = z.object({
  parking: parkingSlug,
  dropoffAt: localDateTime("Date de dépôt invalide."),
  returnAt: localDateTime("Choisissez la date de retour."),
  returnTerminal: optionalTerminal,
  customerName: personName("Indiquez votre nom."),
  phone,
  plate,
  passengers,
  // Only a code the server accepted for the price is sent.
  promoCode: z
    .string()
    .max(40)
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return null;
      const code = normalizePromoCode(v);
      if (!code) {
        ctx.addIssue({ code: "custom", message: "Code promo invalide." });
        return z.NEVER;
      }
      return code;
    }),
});

export const retryPaymentSchema = z.object({ bookingId: z.uuid("Réservation introuvable.") });

export const bagsReadySchema = z.object({
  token: accessToken,
  terminal: z.string().min(1, "Choisissez votre terminal.").max(40, "Terminal inconnu."),
});

export const cancelPickupSchema = z.object({ token: accessToken });

export const reviewSchema = z.object({
  token: accessToken,
  rating: z.coerce
    .number({ error: "Choisissez une note de 1 à 5 étoiles." })
    .int("Choisissez une note de 1 à 5 étoiles.")
    .min(1, "Choisissez une note de 1 à 5 étoiles.")
    .max(5, "Choisissez une note de 1 à 5 étoiles."),
  comment: z
    .string()
    .normalize("NFC")
    .trim()
    .max(REVIEW_MAX_LENGTH, tooLong(REVIEW_MAX_LENGTH))
    .refine((v) => !HIDDEN_CHARS_MULTILINE.test(v), "Caractères non autorisés.")
    .optional()
    .transform(emptyToNull),
  publishConsent: z
    .literal("on")
    .optional()
    .transform((v) => v === "on"),
});

// --- Front desk ---------------------------------------------------------------

export const arrivalSearchSchema = z.object({ reference });

export const checkInSchema = z.object({ reference, spot });

export const walkInSchema = z.object({
  parking: parkingSlug,
  returnAt: localDateTime("Date de retour invalide."),
  returnTerminal: optionalTerminal,
  customerName: personName("Indiquez le nom du client."),
  phone,
  // Optional at the desk: without it, the customer scans their link on the screen.
  email: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(email.nullable()),
  plate,
  passengers,
  spot,
  paid: z.literal("on", { error: "Confirmez que le paiement a été encaissé." }),
});

// --- Shuttle ------------------------------------------------------------------

export const advancePickupSchema = z.object({
  id: z.uuid(),
  from: z.enum(PICKUP_STATUSES),
  to: z.enum(PICKUP_STATUSES),
});

/** A browser's push subscription (Web Push): HTTPS endpoint and base64url keys. */
// The browsers' push services (Chrome/Android/Opera/Samsung, Firefox, Edge, Safari): the
// server only ever sends notifications to them, never to another address.
const PUSH_HOSTS = /^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com|([a-z0-9-]+\.)*push\.apple\.com)$/;

const pushEndpoint = z
  .url({ protocol: /^https$/, hostname: PUSH_HOSTS })
  .max(2048);

export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpoint,
  keys: z.object({
    p256dh: z.base64url().max(200),
    auth: z.base64url().max(100),
  }),
});

export const pushEndpointSchema = pushEndpoint;

// --- Management ---------------------------------------------------------------

// "5", "5,50" or "5.50" €
const euros = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const amount = Number(v.replace(",", "."));
    if (!/^\d+([.,]\d{1,2})?$/.test(v) || !(amount > 0) || amount > 1000) {
      ctx.addIssue({ code: "custom", message: "Montant entre 0,01 € et 1 000 €." });
      return z.NEVER;
    }
    return Math.round(amount * 100);
  });

export const promoCodeSchema = z
  .object({
    code: z
      .string()
      .max(40, "3 à 20 lettres ou chiffres.")
      .transform((value, ctx) => {
        const code = normalizePromoCode(value);
        if (!code) {
          ctx.addIssue({ code: "custom", message: "3 à 20 lettres ou chiffres." });
          return z.NEVER;
        }
        return code;
      }),
    kind: z.enum(["percent", "amount"], { error: "Choisissez le type de réduction." }),
    percent: z.string().max(10).optional(),
    amount: z.string().max(10).optional(),
    validDays: z.coerce
      .number({ error: "Indiquez une durée." })
      .int("Un nombre de jours entier.")
      .min(1, "Au moins 1 jour.")
      .max(MAX_VALIDITY_DAYS, `Au plus ${MAX_VALIDITY_DAYS} jours.`),
    maxUses: z
      .string()
      .max(10)
      .optional()
      .transform((v, ctx) => {
        if (!v?.trim()) return null;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 100000) {
          ctx.addIssue({ code: "custom", message: "Un nombre entier, ou vide pour illimité." });
          return z.NEVER;
        }
        return n;
      }),
    description: singleLine(80).optional().transform(emptyToNull),
  })
  .transform((data, ctx) => {
    let value: number;
    if (data.kind === "percent") {
      value = Number(data.percent);
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        ctx.addIssue({ code: "custom", path: ["percent"], message: "Entre 1 et 100 %." });
        return z.NEVER;
      }
    } else {
      const parsed = euros.safeParse(data.amount ?? "");
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: parsed.error.issues[0].message });
        return z.NEVER;
      }
      value = parsed.data;
    }
    return {
      code: data.code,
      kind: data.kind,
      value,
      validDays: data.validDays,
      maxUses: data.maxUses,
      description: data.description,
    };
  });

export const promoActiveSchema = z.object({
  id: z.uuid(),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

// --- Helpers ------------------------------------------------------------------

export type FieldErrors = Record<string, string>;

/** The first message of each field, as the forms show them. */
export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const { fieldErrors } = z.flattenError(error);
  const result: FieldErrors = {};
  for (const [field, messages] of Object.entries(fieldErrors) as [string, string[] | undefined][]) {
    if (messages?.[0]) result[field] = messages[0];
  }
  return result;
}

/** The text fields of a form, without React's internal "$ACTION_…" entries. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("$") && typeof value === "string") values[key] = value;
  }
  return values;
}

export type ParsedForm<T> =
  | { ok: true; data: T; values: Record<string, string> }
  | { ok: false; fieldErrors: FieldErrors; values: Record<string, string> };

/** Server side: the form's values checked against its schema. */
export function parseForm<S extends z.ZodType>(schema: S, formData: FormData): ParsedForm<z.output<S>> {
  const values = formValues(formData);
  const parsed = schema.safeParse(values);
  return parsed.success
    ? { ok: true, data: parsed.data, values }
    : { ok: false, fieldErrors: fieldErrorsOf(parsed.error), values };
}
