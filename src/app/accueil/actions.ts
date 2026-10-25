"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { arrivalPath, normalizeReference, normalizeSpot } from "@/lib/arrival";
import { parisLocalToDate } from "@/lib/time";
import { checkInVehicle, createWalkInBooking } from "@/server/bookings";
import { hasAccess } from "@/server/team-access";

/** Front desk: opens a booking from the reference typed by hand. */
export async function findArrivalAction(_prev: string | null, formData: FormData) {
  if (!(await hasAccess("accueil"))) return "Accès refusé.";
  const reference = normalizeReference(String(formData.get("reference") ?? ""));
  if (!reference) return "Référence invalide : elle ressemble à ESC-AB12CD.";
  redirect(arrivalPath(reference));
}

export type WalkInState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const walkInSchema = z.object({
  parking: z.string().min(1, "Choisissez le parking."),
  returnAt: z.string().transform((value, ctx) => {
    const date = parisLocalToDate(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Date de retour invalide." });
      return z.NEVER;
    }
    return date;
  }),
  returnTerminal: z
    .string()
    .optional()
    .transform((v) => (v && v !== "inconnu" ? v : null)),
  customerName: z.string().trim().min(2, "Indiquez le nom du client."),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s.-]{7,}$/, "Numéro de téléphone invalide."),
  // Optional at the desk: without it, the customer scans their link on the screen.
  email: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.email("E-mail invalide.").nullable()),
  plate: z
    .string()
    .trim()
    .min(4, "Plaque invalide.")
    .transform((v) => v.toUpperCase()),
  passengers: z.coerce.number().int().min(1).max(8),
  spot: z.string().transform((value, ctx) => {
    const spot = normalizeSpot(value);
    if (!spot) {
      ctx.addIssue({ code: "custom", message: "Place invalide : lettres et chiffres, par exemple B12." });
      return z.NEVER;
    }
    return spot;
  }),
  paid: z.literal("on", { error: "Confirmez que le paiement a été encaissé." }),
});

/** Front desk: a customer without booking pays on site and leaves the car now. */
export async function createWalkInAction(_prev: WalkInState, formData: FormData): Promise<WalkInState> {
  if (!(await hasAccess("accueil"))) return { error: "Accès refusé." };
  const values = Object.fromEntries(
    [...formData.entries()].filter(([key, v]) => !key.startsWith("$") && typeof v === "string"),
  ) as Record<string, string>;
  const parsed = walkInSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: "Vérifiez les champs indiqués.", fieldErrors, values };
  }

  const { parking, returnAt, returnTerminal, customerName, phone, email, plate, passengers, spot } = parsed.data;
  const result = await createWalkInBooking({
    parkingSlug: parking,
    returnAt,
    returnTerminal,
    customerName,
    phone,
    email,
    plate,
    passengers,
    spot,
  });
  if (!result.ok) return { error: result.error, values };
  redirect(`${arrivalPath(result.booking.reference)}?nouveau=1`);
}

/** `spot`: what the agent typed, kept in the field after an error. */
export type CheckInState = { error?: string; spot?: string };

/** Front desk: the customer left the car at this spot. */
export async function checkInVehicleAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  if (!(await hasAccess("accueil"))) return { error: "Accès refusé." };
  const typed = String(formData.get("spot") ?? "");
  const reference = normalizeReference(String(formData.get("reference") ?? ""));
  const spot = normalizeSpot(typed);
  if (!reference) return { error: "Référence invalide.", spot: typed };
  if (!spot) return { error: "Indiquez la place : lettres et chiffres, par exemple B12.", spot: typed };
  const result = await checkInVehicle(reference, spot);
  if (!result.ok) return { error: result.error, spot: typed };
  refresh();
  return {};
}
