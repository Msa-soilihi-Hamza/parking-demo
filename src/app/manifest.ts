import type { MetadataRoute } from "next";

// Lets the shuttle team install the site on their phone. On iPhone, push notifications
// only work for a site added to the home screen, so this is what makes them possible there.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Escale · Navette",
    short_name: "Escale Navette",
    description: "Les demandes de navette des clients Escale, en direct.",
    start_url: "/navette",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#b4231b",
    lang: "fr",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
