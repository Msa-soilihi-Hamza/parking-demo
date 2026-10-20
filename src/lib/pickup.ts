// Return trip state machine: the shuttle only leaves once the customer has their bags.
//
//   scheduled ──(client: "J'ai mes bagages")──▶ bags_ready ──(driver)──▶ en_route ──(driver)──▶ picked_up

export const PICKUP_STATUSES = ["scheduled", "bags_ready", "en_route", "picked_up"] as const;
export type PickupStatus = (typeof PICKUP_STATUSES)[number];

const TRANSITIONS: Record<PickupStatus, PickupStatus | null> = {
  scheduled: "bags_ready",
  bags_ready: "en_route",
  en_route: "picked_up",
  picked_up: null,
};

export function nextStatus(status: PickupStatus): PickupStatus | null {
  return TRANSITIONS[status];
}

export function canTransition(from: PickupStatus, to: PickupStatus): boolean {
  return TRANSITIONS[from] === to;
}

/** The bags button opens a few hours before the planned landing (flights can be early). */
export const BAGS_BUTTON_OPENS_BEFORE_MS = 6 * 60 * 60 * 1000;

export function bagsButtonOpen(returnAt: Date, now: Date): boolean {
  return now.getTime() >= returnAt.getTime() - BAGS_BUTTON_OPENS_BEFORE_MS;
}

export const PICKUP_LABELS: Record<PickupStatus, string> = {
  scheduled: "Retour prévu",
  bags_ready: "Bagages récupérés",
  en_route: "Navette en route",
  picked_up: "Pris en charge",
};
