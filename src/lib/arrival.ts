// Front desk: the customer shows a QR code (or reads their reference), the
// employee notes the parking spot where the car was left.

/** "  esc-ab12cd " → "ESC-AB12CD"; also accepts the reference without its prefix. */
export function normalizeReference(input: string): string | null {
  const value = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!value) return null;
  const reference = value.startsWith("ESC-") ? value : `ESC-${value}`;
  return /^ESC-[A-Z0-9]{2,12}$/.test(reference) ? reference : null;
}

/** "b 12" → "B12": letters, digits and dashes, as painted on the ground. */
export function normalizeSpot(input: string): string | null {
  const value = input.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9-]{1,8}$/.test(value) ? value : null;
}

/** Where the QR code leads: the booking's page in the team space (login required). */
export function arrivalPath(reference: string): string {
  return `/navette/accueil/${encodeURIComponent(reference)}`;
}
