"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { arrivalPath } from "@/lib/arrival";
import { arrivalSearchSchema, checkInSchema, parseForm, walkInSchema } from "@/lib/validation";
import { checkInVehicle, createWalkInBooking } from "@/server/bookings";
import { hasAccess } from "@/server/team-access";

/** Front desk: opens a booking from the reference typed by hand. */
export async function findArrivalAction(_prev: string | null, formData: FormData) {
  if (!(await hasAccess("accueil"))) return "Accès refusé.";
  const form = parseForm(arrivalSearchSchema, formData);
  if (!form.ok) return form.fieldErrors.reference;
  redirect(arrivalPath(form.data.reference));
}

export type WalkInState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

/** Front desk: a customer without booking pays on site and leaves the car now. */
export async function createWalkInAction(_prev: WalkInState, formData: FormData): Promise<WalkInState> {
  if (!(await hasAccess("accueil"))) return { error: "Accès refusé." };
  const form = parseForm(walkInSchema, formData);
  const { values } = form;
  if (!form.ok) return { error: "Vérifiez les champs indiqués.", fieldErrors: form.fieldErrors, values };

  const { parking, returnAt, returnTerminal, customerName, phone, email, plate, passengers, spot } = form.data;
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
  const form = parseForm(checkInSchema, formData);
  const typed = form.values.spot?.slice(0, 20) ?? "";
  if (!form.ok) return { error: form.fieldErrors.reference ?? form.fieldErrors.spot, spot: typed };
  const result = await checkInVehicle(form.data.reference, form.data.spot);
  if (!result.ok) return { error: result.error, spot: typed };
  refresh();
  return {};
}
