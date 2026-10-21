import { ImageResponse } from "next/og";
import { EscaleMark } from "@/components/escale-mark";

// Home-screen icon on iPhone: needed for the installed shuttle app (push on iOS).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<EscaleMark size={180} />, size);
}
