import { createAuthClient } from "better-auth/react";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";
import { ac, roles } from "@/lib/permissions";

// Same domain as the server: no baseURL needed (Better Auth docs).
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), adminClient({ ac, roles })],
});
