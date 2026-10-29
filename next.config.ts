import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy without a nonce (Next.js CSP guide, "Without Nonces"): a nonce
// forces every page to render per request, which cacheComponents' static shells can't do.
// So inline scripts stay allowed; the rest is locked down. Stripe Checkout and Google
// sign-in are full-page redirects, listed in form-action for the no-JavaScript fallback.
// React needs eval in development only.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://accounts.google.com",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// Report-only while it is being checked: violations show in the console, nothing is blocked.
const CSP_HEADER = "Content-Security-Policy-Report-Only";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Security headers on every page (Next.js headers guide). No camera or location:
  // the QR codes are scanned with the phone's own camera app.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The customer's link (/reservation/<secret>) never leaks to another site.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: CSP_HEADER, value: contentSecurityPolicy },
        ],
      },
    ];
  },
  // The front desk got its own space, apart from the drivers': old links and QR codes
  // already sent by e-mail keep working (query strings such as ?date= are passed through).
  redirects() {
    return [
      { source: "/navette/planning", destination: "/navette/journees", permanent: true },
      { source: "/navette/historique", destination: "/navette/journees", permanent: true },
      { source: "/navette/accueil", destination: "/accueil", permanent: true },
      { source: "/navette/accueil/:reference", destination: "/accueil/reservation/:reference", permanent: true },
      // The short-lived "/parking" name of the front desk space.
      { source: "/parking", destination: "/accueil", permanent: true },
      { source: "/parking/vehicules", destination: "/accueil/vehicules", permanent: true },
      { source: "/parking/reservation/:reference", destination: "/accueil/reservation/:reference", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
