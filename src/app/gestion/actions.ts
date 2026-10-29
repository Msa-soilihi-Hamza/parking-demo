"use server";

import { refresh } from "next/cache";
import { parseForm, promoActiveSchema, promoCodeSchema } from "@/lib/validation";
import { createPromoCode, setPromoActive } from "@/server/promo-codes";
import { hasAccess } from "@/server/team-access";

export type PromoFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** The code just created, to confirm it */
  created?: string;
};

/** The manager creates a code, valid for a number of days from today. */
export async function createPromoCodeAction(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  if (!(await hasAccess("gestion"))) return { error: "Accès refusé." };
  const form = parseForm(promoCodeSchema, formData);
  const { values } = form;
  if (!form.ok) return { error: "Vérifiez les champs indiqués.", fieldErrors: form.fieldErrors, values };

  const result = await createPromoCode(form.data);
  if (!result.ok) return { error: result.error, fieldErrors: { code: result.error }, values };
  refresh();
  return { created: result.promo.code };
}

export async function setPromoActiveAction(formData: FormData) {
  if (!(await hasAccess("gestion"))) throw new Error("Accès refusé.");
  const form = parseForm(promoActiveSchema, formData);
  if (!form.ok) throw new Error("Code promo inconnu.");
  await setPromoActive(form.data.id, form.data.active);
  refresh();
}
