// Return trip state machine: the shuttle only leaves once the customer has their bags.
//
//   scheduled ──(client: "J'ai mes bagages")──▶ bags_ready ──(driver)──▶ en_route ──(driver)──▶ picked_up
//       ▲                                           │
//       └────────(client: "Annuler ma demande")─────┘   only until the driver leaves
//
// The button works at any time: a customer back earlier than planned must not have to call.

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

/** A mistaken press can be undone until a driver has left to pick the customer up. */
export function canCancelRequest(status: PickupStatus): boolean {
  return status === "bags_ready";
}

export const PICKUP_LABELS: Record<PickupStatus, string> = {
  scheduled: "Retour prévu",
  bags_ready: "Bagages récupérés",
  en_route: "Navette en route",
  picked_up: "Pris en charge",
};
