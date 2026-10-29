"use client";

import { useState, type FormEvent } from "react";
import type { z } from "zod";
import { fieldErrorsOf, formValues, type FieldErrors } from "@/lib/validation";

/**
 * Checks a form in the browser with the same Zod schema as its Server Action: the
 * errors show at once and nothing is sent. The server checks again whatever happens
 * here. `serverErrors`: the action's own field errors, shown until the field is edited.
 */
export function useFormValidation(schema: z.ZodType, serverErrors?: FieldErrors) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const result = schema.safeParse(formValues(new FormData(form)));
    setEdited(new Set());
    if (result.success) {
      setErrors({});
      return;
    }
    // React does not call the form's action when the submit is prevented.
    event.preventDefault();
    const next = fieldErrorsOf(result.error);
    setErrors(next);
    const first = Object.keys(next)
      .map((name) => form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]:not([type="hidden"])`))
      .find(Boolean);
    first?.focus();
  }

  // Typing in a field hides its error until the next submit.
  function onInput(event: FormEvent<HTMLFormElement>) {
    const name = (event.target as Partial<HTMLInputElement>).name;
    if (!name) return;
    setErrors((current) => {
      if (!(name in current)) return current;
      const rest = { ...current };
      delete rest[name];
      return rest;
    });
    setEdited((current) => (current.has(name) ? current : new Set(current).add(name)));
  }

  /** The message to show under a field, if any. */
  const errorFor = (name: string): string | undefined =>
    errors[name] ?? (edited.has(name) ? undefined : serverErrors?.[name]);

  return { onSubmit, onInput, errorFor };
}
