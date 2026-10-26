"use client";

import { ArrowLeftIcon, Loader2Icon, MailIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

type AuthError = { code?: string; status?: number; message?: string } | null;

/** Better Auth's errors, in the customer's words. */
function messageFor(error: AuthError): string {
  if (!error) return "";
  if (error.status === 429) return "Trop de demandes. Patientez une minute avant de réessayer.";
  switch (error.code) {
    case "INVALID_OTP":
      return "Code incorrect. Vérifiez les 6 chiffres reçus par e-mail.";
    case "OTP_EXPIRED":
      return "Ce code a expiré. Demandez-en un nouveau.";
    case "TOO_MANY_ATTEMPTS":
      return "Trop d'essais avec ce code. Demandez-en un nouveau.";
    default:
      return "La connexion n'a pas abouti. Réessayez.";
  }
}

/**
 * Sign in or create an account in the same step: Google, or a 6-digit code sent by
 * e-mail (no password). `callbackURL`: where Google brings the customer back.
 */
export function SignInPanel({
  googleEnabled,
  callbackURL,
  onSignedIn,
}: {
  googleEnabled: boolean;
  callbackURL: string;
  /** Called once signed in with the code; by default the page is refreshed. */
  onSignedIn?: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, startTransition] = useTransition();

  const sendCode = () =>
    startTransition(async () => {
      setError("");
      setInfo("");
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
      if (error) return setError(messageFor(error));
      setOtp("");
      setStep("code");
      setInfo("Code envoyé.");
    });

  const verify = (code: string) =>
    startTransition(async () => {
      setError("");
      const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code });
      if (error) {
        setOtp("");
        return setError(messageFor(error));
      }
      if (onSignedIn) onSignedIn();
      else router.refresh();
    });

  const google = () =>
    startTransition(async () => {
      setError("");
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        errorCallbackURL: `/connexion?erreur=google&suite=${encodeURIComponent(callbackURL)}`,
      });
      // On success the browser leaves for Google; an error means it could not start.
      if (error) setError(messageFor(error));
    });

  return (
    <div className="space-y-5">
      {googleEnabled && step === "email" && (
        <>
          <Button type="button" variant="outline" size="lg" className="w-full" disabled={pending} onClick={google}>
            <GoogleIcon /> Continuer avec Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> ou <Separator className="flex-1" />
          </div>
        </>
      )}

      {step === "email" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
          className="space-y-4"
        >
          <Field>
            <FieldLabel htmlFor="signin-email">E-mail</FieldLabel>
            <Input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
            />
            <FieldDescription>Nous vous envoyons un code à 6 chiffres : pas de mot de passe à retenir.</FieldDescription>
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={pending || !email.trim()}>
            {pending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
            Recevoir un code
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Code envoyé à <span className="font-medium text-foreground">{email}</span>. Il est valable 10 minutes.
          </p>
          <InputOTP
            maxLength={6}
            value={otp}
            onChange={(value) => {
              setOtp(value);
              // The 6th digit signs in: no extra button to press.
              if (value.length === 6) verify(value);
            }}
            inputMode="numeric"
            pattern="^[0-9]+$"
            autoFocus
            disabled={pending}
            containerClassName="justify-start"
          >
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep("email")} disabled={pending}>
              <ArrowLeftIcon /> Changer d&apos;e-mail
            </Button>
            <Button type="button" variant="link" size="sm" onClick={sendCode} disabled={pending}>
              Renvoyer un code
            </Button>
            {pending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        En continuant, vous acceptez les{" "}
        <Link href="/conditions" className="underline underline-offset-4 hover:text-foreground">
          conditions d&apos;utilisation
        </Link>{" "}
        et les{" "}
        <Link href="/confidentialite" className="underline underline-offset-4 hover:text-foreground">
          règles de confidentialité
        </Link>
        .
      </p>
      {info && !error && step === "code" && <p className="sr-only">{info}</p>}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}
