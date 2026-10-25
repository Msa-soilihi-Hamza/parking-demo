// The physical spots of a parking, derived from its capacity: rows of 20 spots,
// lettered from A ("A1" … "A20", "B1" …). Pure functions, shared by the desk's plan,
// the suggested spot and the server-side check.

export const SPOTS_PER_ROW = 20;
const ROW_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O: too close to 1 and 0

export type SpotRow = { row: string; spots: string[] };

export function spotLayout(capacity: number): SpotRow[] {
  const rows: SpotRow[] = [];
  for (let start = 0, i = 0; start < capacity && i < ROW_LETTERS.length; start += SPOTS_PER_ROW, i++) {
    const count = Math.min(SPOTS_PER_ROW, capacity - start);
    const row = ROW_LETTERS[i];
    rows.push({ row, spots: Array.from({ length: count }, (_, n) => `${row}${n + 1}`) });
  }
  return rows;
}

export function allSpots(capacity: number): string[] {
  return spotLayout(capacity).flatMap((r) => r.spots);
}

export function isValidSpot(spot: string, capacity: number): boolean {
  return allSpots(capacity).includes(spot);
}

/** "A1 à F20": the range to quote when a spot does not exist. */
export function spotRange(capacity: number): string {
  const spots = allSpots(capacity);
  return spots.length ? `${spots[0]} à ${spots[spots.length - 1]}` : "aucune place";
}

/** The first free spot in plan order, or null when every spot is taken. */
export function firstFreeSpot(capacity: number, occupied: Iterable<string>): string | null {
  const taken = new Set(occupied);
  return allSpots(capacity).find((spot) => !taken.has(spot)) ?? null;
}
