import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

// Better Auth's endpoints (/api/auth/*): sign-in code, Google callback, session.
export const { GET, POST } = toNextJsHandler(auth);
