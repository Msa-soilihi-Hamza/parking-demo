"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createPromoCode, MAX_VALIDITY_DAYS, setPromoActive } from "@/server/promo-codes";
import { hasAccess } from "@/server/team-access";

export type PromoFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** The code just created, to confirm it */
  created?: string;
};

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

const promoSchema = z
  .object({
    code: z.string(),
    kind: z.enum(["percent", "amount"], { error: "Choisissez le type de réduction." }),
    percent: z.string().optional(),
    amount: z.string().optional(),
    validDays: z.coerce
      .number({ error: "Indiquez une durée." })
      .int("Un nombre de jours entier.")
      .min(1, "Au moins 1 jour.")
      .max(MAX_VALIDITY_DAYS, `Au plus ${MAX_VALIDITY_DAYS} jours.`),
    maxUses: z
      .string()
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
    description: z
      .string()
      .optional()
      .transform((v) => v?.trim().slice(0, 80) || null),
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
    return { code: data.code, kind: data.kind, value, validDays: data.validDays, maxUses: data.maxUses, description: data.description };
  });

/** The manager creates a code, valid for a number of days from today. */
export async function createPromoCodeAction(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  if (!(await hasAccess("gestion"))) return { error: "Accès refusé." };
  const values = Object.fromEntries(
    [...formData.entries()].filter(([key, v]) => !key.startsWith("$") && typeof v === "string"),
  ) as Record<string, string>;

  const parsed = promoSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: "Vérifiez les champs indiqués.", fieldErrors, values };
  }

  const result = await createPromoCode(parsed.data);
  if (!result.ok) return { error: result.error, fieldErrors: { code: result.error }, values };
  refresh();
  return { created: result.promo.code };
}

export async function setPromoActiveAction(formData: FormData) {
  if (!(await hasAccess("gestion"))) throw new Error("Accès refusé.");
  await setPromoActive(String(formData.get("id") ?? ""), formData.get("active") === "true");
  refresh();
}
