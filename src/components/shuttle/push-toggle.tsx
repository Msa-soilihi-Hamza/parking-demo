"use client";

import { BellIcon, BellOffIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendTestPushAction, subscribePushAction, unsubscribePushAction } from "@/app/navette/actions";
import { Button } from "@/components/ui/button";

type Status = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function detectStatus(): Promise<Status> | Status {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia("(display-mode: standalone)").matches;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iPhone only exposes push to sites added to the home screen.
    return isIOS && !installed ? "ios-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return registerWorker()
    .then((registration) => registration.pushManager.getSubscription())
    .then((sub): Status => (sub ? "on" : "off"));
}

// Registered once per page: status checks run again on every return to the tab.
let workerRegistration: Promise<ServiceWorkerRegistration> | null = null;
function registerWorker() {
  workerRegistration ??= navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return workerRegistration;
}

/** "Activer les notifications": the driver gets a push when a customer has their bags. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // While enabling or disabling, a background re-check would overwrite the result half-way.
  const busy = useRef(false);

  // The permission can change outside the page (Chrome or Android settings): it is read
  // again when the user comes back to the tab, without reloading.
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (busy.current || document.visibilityState === "hidden") return;
      Promise.resolve(detectStatus())
        .then((s) => active && !busy.current && setStatus(s))
        .catch(() => active && setStatus("unsupported"));
    };
    refresh();

    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    let permission: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: "notifications" })
      .then((p) => {
        if (!active) return;
        permission = p;
        p.addEventListener("change", refresh);
      })
      .catch(() => {});

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
      permission?.removeEventListener("change", refresh);
    };
  }, []);

  /** Runs an enable/disable step with background re-checks paused. */
  const run = (step: () => Promise<void>) =>
    startTransition(async () => {
      busy.current = true;
      try {
        await step();
      } finally {
        busy.current = false;
      }
    });

  if (!publicKey || status === "loading" || status === "unsupported") return null;

  if (status === "ios-install") {
    return (
      <p className="text-sm text-muted-foreground">
        Pour recevoir les notifications sur iPhone : bouton Partager, puis « Sur l&apos;écran d&apos;accueil », et
        ouvrez Escale depuis l&apos;icône.
      </p>
    );
  }

  if (status === "denied") {
    const android = /Android/.test(navigator.userAgent);
    const recheck = () =>
      run(async () => {
        const next = await detectStatus();
        setStatus(next);
        setMessage(next === "denied" ? "Toujours bloquées pour ce site." : null);
      });
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>Notifications bloquées pour ce site.</p>
        <ul className="list-disc space-y-1 pl-5">
          {android ? (
            <>
              <li>
                Ouvrez le site <strong>directement dans Chrome</strong> : ouvert depuis une autre application
                (Gmail, WhatsApp…), il n&apos;a pas les mêmes autorisations.
              </li>
              <li>
                Chrome, ⋮ → Paramètres → Paramètres des sites → Notifications : ce site doit être sur « Autorisé ».
              </li>
              <li>
                Réglages Android → Applications → Chrome → Notifications : elles doivent être activées pour Chrome.
              </li>
            </>
          ) : (
            <li>Autorisez les notifications pour ce site dans les réglages du navigateur.</li>
          )}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={recheck} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <BellIcon />}
            C&apos;est autorisé, réessayer
          </Button>
          {message && <span>{message}</span>}
        </div>
      </div>
    );
  }

  const enable = () =>
    run(async () => {
      setMessage(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          if (permission !== "denied") setMessage("Autorisation non accordée.");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await subscribePushAction(JSON.parse(JSON.stringify(sub)));
        setStatus("on");
        const result = await sendTestPushAction();
        setMessage(result.sent > 0 ? "Notification de test envoyée." : "Activé, mais l'envoi a échoué.");
      } catch (error) {
        console.error("Push subscription failed", error);
        setMessage(`Activation impossible : ${(error as Error).message || "erreur du navigateur"}.`);
      }
    });

  const disable = () =>
    run(async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await unsubscribePushAction(sub.endpoint);
          await sub.unsubscribe();
        }
        setStatus("off");
        setMessage(null);
      } catch (error) {
        console.error("Push unsubscribe failed", error);
        setMessage("Désactivation impossible, réessayez.");
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "on" ? (
        <>
          <span className="inline-flex items-center gap-2 text-sm">
            <BellIcon className="size-4 text-primary" /> Notifications activées sur cet appareil
          </span>
          <Button variant="ghost" size="sm" onClick={disable} disabled={pending}>
            <BellOffIcon /> Désactiver
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={enable} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <BellIcon />}
          Activer les notifications
        </Button>
      )}
      {message && <span className="text-sm text-muted-foreground">{message}</span>}
    </div>
  );
}
