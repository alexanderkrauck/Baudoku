import type { RoomReport } from "../types";
export const STANDARD_TRADES = [
  "Elektro",
  "Fliesenleger",
  "Maler",
  "Innentüren-Lieferant",
  "Tischler",
  "Bodenleger",
  "Sanitär",
  "Heizung / Lüftung",
  "Trockenbau",
  "Fenster / Sonnenschutz",
  "Baumeister",
  "Reinigung",
];
export function tradeOptions(rooms: RoomReport[]) {
  return [
    ...new Set(
      [
        ...STANDARD_TRADES,
        ...rooms.flatMap((r) =>
          (r.defects || []).map((d) => d.trade?.trim() || ""),
        ),
      ].filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "de"));
}
