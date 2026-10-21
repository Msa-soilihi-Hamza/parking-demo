import { ImageResponse } from "next/og";
import { EscaleMark } from "@/components/escale-mark";

// App icons for the installed shuttle app and its notifications, rendered once at build.
const SIZES = ["96", "192", "512"] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export async function GET(_request: Request, { params }: RouteContext<"/pwa-icon/[size]">) {
  const { size: raw } = await params;
  const size = SIZES.includes(raw as (typeof SIZES)[number]) ? Number(raw) : 192;
  return new ImageResponse(<EscaleMark size={size} />, { width: size, height: size });
}
