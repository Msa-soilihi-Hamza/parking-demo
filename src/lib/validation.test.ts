import { describe, expect, it } from "vitest";
import {
  advancePickupSchema,
  bookingDetailsSchema,
  fieldErrorsOf,
  formValues,
  promoCodeSchema,
  pushSubscriptionSchema,
  quoteInputSchema,
  reviewSchema,
  signInEmailSchema,
  walkInSchema,
} from "./validation";

const booking = (overrides: Record<string, string> = {}) => ({
  parking: "orly",
  dropoffAt: "2026-11-02T08:00",
  returnAt: "2026-11-09T18:30",
  returnTerminal: "inconnu",
  customerName: "Sarah Martin",
  phone: "06 12 34 56 78",
  plate: "ab-123-cd",
  passengers: "2",
  promoCode: "",
  ...overrides,
});

const errorsOf = (schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? {} : fieldErrorsOf(result.error as Parameters<typeof fieldErrorsOf>[0]);
};

describe("bookingDetailsSchema", () => {
  it("accepts a normal booking and normalizes it", () => {
    const parsed = bookingDetailsSchema.parse(booking({ promoCode: " noel15 " }));
    expect(parsed.plate).toBe("AB-123-CD");
    expect(parsed.passengers).toBe(2);
    expect(parsed.returnTerminal).toBeNull();
    expect(parsed.promoCode).toBe("NOEL15");
    expect(parsed.dropoffAt).toBeInstanceOf(Date);
  });

  it("accepts accented and compound names", () => {
    for (const name of ["Zoé D'Arcy-Lefèvre", "Ngozi Okonkwo", "J. Dupont", "O’Neil"]) {
      expect(bookingDetailsSchema.safeParse(booking({ customerName: name })).success, name).toBe(true);
    }
  });

  it("refuses markup, invisible characters and overlong values", () => {
    expect(errorsOf(bookingDetailsSchema, booking({ customerName: "<script>alert(1)</script>" }))).toHaveProperty(
      "customerName",
    );
    expect(errorsOf(bookingDetailsSchema, booking({ customerName: "Sarah‮Martin" }))).toHaveProperty("customerName");
    expect(errorsOf(bookingDetailsSchema, booking({ customerName: "A".repeat(81) }))).toHaveProperty("customerName");
    expect(errorsOf(bookingDetailsSchema, booking({ plate: '<a href="x">' }))).toHaveProperty("plate");
    expect(errorsOf(bookingDetailsSchema, booking({ plate: "AB-123-CD-EF-GH" }))).toHaveProperty("plate");
  });

  it("checks the phone number's digits", () => {
    expect(errorsOf(bookingDetailsSchema, booking({ phone: "+33 6 12 34 56 78" }))).toEqual({});
    expect(errorsOf(bookingDetailsSchema, booking({ phone: "123" }))).toHaveProperty("phone");
    expect(errorsOf(bookingDetailsSchema, booking({ phone: "1".repeat(16) }))).toHaveProperty("phone");
    expect(errorsOf(bookingDetailsSchema, booking({ phone: "06 12 34 56 78; drop" }))).toHaveProperty("phone");
  });

  it("refuses impossible dates and passenger counts", () => {
    expect(errorsOf(bookingDetailsSchema, booking({ returnAt: "" }))).toHaveProperty("returnAt");
    expect(errorsOf(bookingDetailsSchema, booking({ dropoffAt: "2026-13-40T99:00" }))).toHaveProperty("dropoffAt");
    expect(errorsOf(bookingDetailsSchema, booking({ passengers: "9" }))).toHaveProperty("passengers");
    expect(errorsOf(bookingDetailsSchema, booking({ passengers: "abc" }))).toHaveProperty("passengers");
    expect(errorsOf(bookingDetailsSchema, booking({ parking: "../admin" }))).toHaveProperty("parking");
  });
});

describe("quoteInputSchema", () => {
  it("rejects what a page would never send", () => {
    expect(quoteInputSchema.safeParse({ parking: "orly", dropoffAt: "2026-11-02T08:00", returnAt: "2026-11-09T08:00" }).success).toBe(true);
    expect(quoteInputSchema.safeParse({ parking: { $ne: 1 }, dropoffAt: "x", returnAt: "y" }).success).toBe(false);
    expect(quoteInputSchema.safeParse(null).success).toBe(false);
  });
});

describe("walkInSchema", () => {
  const walkIn = (overrides: Record<string, string> = {}) => ({
    ...booking(),
    email: "",
    spot: " b 12 ",
    paid: "on",
    ...overrides,
  });

  it("keeps the e-mail optional but checks it when given", () => {
    expect(walkInSchema.parse(walkIn()).email).toBeNull();
    expect(walkInSchema.parse(walkIn()).spot).toBe("B12");
    expect(errorsOf(walkInSchema, walkIn({ email: "pas-un-email" }))).toHaveProperty("email");
    expect(errorsOf(walkInSchema, walkIn({ email: `${"a".repeat(250)}@example.com` }))).toHaveProperty("email");
  });

  it("requires the payment to be confirmed", () => {
    const unpaid: Record<string, string> = walkIn();
    delete unpaid.paid;
    expect(errorsOf(walkInSchema, unpaid)).toHaveProperty("paid");
  });
});

describe("reviewSchema", () => {
  it("allows line breaks and emoji, not control characters", () => {
    const base = { token: "demo-retour", rating: "5" };
    expect(reviewSchema.parse({ ...base, comment: "Parfait.\nMerci 👨‍👩‍👧 !" }).comment).toBe("Parfait.\nMerci 👨‍👩‍👧 !");
    expect(reviewSchema.parse({ ...base, comment: "   " }).comment).toBeNull();
    expect(reviewSchema.safeParse({ ...base, comment: "Bien\u0000" }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, comment: "a".repeat(501) }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, rating: "0" }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, token: "../../etc" }).success).toBe(false);
  });
});

describe("promoCodeSchema", () => {
  const promo = (overrides: Record<string, string> = {}) => ({
    code: " noel15 ",
    kind: "percent",
    percent: "15",
    validDays: "30",
    maxUses: "",
    description: "",
    ...overrides,
  });

  it("normalizes the code and reads the discount", () => {
    expect(promoCodeSchema.parse(promo())).toMatchObject({ code: "NOEL15", value: 15, maxUses: null, description: null });
    expect(promoCodeSchema.parse(promo({ kind: "amount", amount: "5,50" })).value).toBe(550);
  });

  it("refuses bad codes and descriptions", () => {
    expect(errorsOf(promoCodeSchema, promo({ code: "NO-DASH" }))).toHaveProperty("code");
    expect(errorsOf(promoCodeSchema, promo({ description: "a".repeat(81) }))).toHaveProperty("description");
    expect(errorsOf(promoCodeSchema, promo({ percent: "150" }))).toHaveProperty("percent");
  });
});

describe("other inputs", () => {
  it("checks the sign-in e-mail", () => {
    expect(signInEmailSchema.parse({ email: "  vous@exemple.fr " }).email).toBe("vous@exemple.fr");
    expect(signInEmailSchema.safeParse({ email: "vous@" }).success).toBe(false);
  });

  it("only accepts HTTPS push endpoints", () => {
    const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys }).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "http://evil.test/x", keys }).success).toBe(false);
    // Only the browsers' push services: any other HTTPS address is refused.
    for (const endpoint of [
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/abc",
    ]) {
      expect(pushSubscriptionSchema.safeParse({ endpoint, keys }).success, endpoint).toBe(true);
    }
    for (const endpoint of ["https://evil.test/x", "https://fcm.googleapis.com.evil.test/x", "https://10.0.0.1/x"]) {
      expect(pushSubscriptionSchema.safeParse({ endpoint, keys }).success, endpoint).toBe(false);
    }
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://x.test", keys: { ...keys, auth: "<x>" } }).success).toBe(false);
  });

  it("checks the shuttle's status change", () => {
    const id = "2f1e4a3b-5c6d-4e7f-8a9b-0c1d2e3f4a5b";
    expect(advancePickupSchema.safeParse({ id, from: "bags_ready", to: "en_route" }).success).toBe(true);
    expect(advancePickupSchema.safeParse({ id: "1 OR 1=1", from: "bags_ready", to: "en_route" }).success).toBe(false);
    expect(advancePickupSchema.safeParse({ id, from: "bags_ready", to: "teleported" }).success).toBe(false);
  });

  it("keeps a form's text fields only", () => {
    const data = new FormData();
    data.set("$ACTION_ID_abc", "");
    data.set("name", "Sarah");
    data.set("file", new Blob(["x"]));
    expect(formValues(data)).toEqual({ name: "Sarah" });
  });
});
