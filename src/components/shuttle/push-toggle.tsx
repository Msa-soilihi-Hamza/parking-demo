"use client";

import { BellIcon, BellOffIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
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
  return navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((registration) => registration.pushManager.getSubscription())
    .then((sub): Status => (sub ? "on" : "off"));
}

/** "Activer les notifications": the driver gets a push when a customer has their bags. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    Promise.resolve(detectStatus()).then((s) => active && setStatus(s));
    return () => {
      active = false;
    };
  }, []);

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
    return (
      <p className="text-sm text-muted-foreground">
        Notifications bloquées : autorisez-les pour ce site dans les réglages du navigateur.
      </p>
    );
  }

  const enable = () =>
    startTransition(async () => {
      setMessage(null);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
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
    });

  const disable = () =>
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
      setMessage(null);
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
