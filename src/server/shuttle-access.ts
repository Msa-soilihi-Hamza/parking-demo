import { cookies } from "next/headers";

// Demo-grade gate for the shuttle screen: a shared code stored in an httpOnly cookie.
export const SHUTTLE_COOKIE = "navette_access";

export function shuttleAccessCode() {
  return process.env.SHUTTLE_ACCESS_CODE ?? "navette";
}

export async function hasShuttleAccess() {
  return (await cookies()).get(SHUTTLE_COOKIE)?.value === shuttleAccessCode();
}
