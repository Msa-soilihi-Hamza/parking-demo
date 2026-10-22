import QRCode from "qrcode";
import { arrivalPath } from "@/lib/arrival";
import { appUrl } from "@/server/stripe";

// The customer's QR code: scanned at the front desk, it opens the booking in the
// team space. It only carries the reference, which grants nothing without the
// team login, unlike the customer's private link.

function arrivalUrl(reference: string) {
  return `${appUrl()}${arrivalPath(reference)}`;
}

const options = { errorCorrectionLevel: "M", margin: 1 } as const;

/** Inline SVG for the reservation page. */
export function arrivalQrSvg(reference: string): Promise<string> {
  return QRCode.toString(arrivalUrl(reference), { ...options, type: "svg" });
}

/** PNG for e-mails: Gmail and most clients block inline SVG and data: images. */
export function arrivalQrPng(reference: string): Promise<Buffer> {
  return QRCode.toBuffer(arrivalUrl(reference), { ...options, type: "png", width: 240 });
}
