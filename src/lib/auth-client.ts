import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

// Same domain as the server: no baseURL needed (Better Auth docs).
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
