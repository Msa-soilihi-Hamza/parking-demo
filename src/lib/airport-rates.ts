// What the airport's own car parks charge, for the comparison on the landing page.
// Public rates of the Éco car parks (PR, PX, PW, P3 Éco) at Roissy-CDG, without
// booking: Paris Aéroport grid of 1 January 2026, as listed on cdgfacile.com
// (checked in November 2026). Only the durations the grid publishes.
export const CDG_ECO_PUBLIC_RATES = [
  { days: 1, cents: 5000 },
  { days: 6, cents: 17500 },
  { days: 10, cents: 25500 },
] as const;

export const AIRPORT_RATES_NOTE =
  "Parking de l'aéroport : tarif public des parkings Éco de Roissy-CDG, sans réservation (grille Paris Aéroport au 1er janvier 2026). Prix indicatifs, projet de démonstration.";
