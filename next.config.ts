import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
