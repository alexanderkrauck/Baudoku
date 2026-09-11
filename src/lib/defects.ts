import type { Defect, RoomReport } from "../types";

export const UNASSIGNED_TRADE = "Nicht zugeordnet";
export function defectFields(defect: Defect, room: RoomReport) {
  return {
    ...defect,
    trade: defect.trade?.trim() || UNASSIGNED_TRADE,
    location: defect.location?.trim() || room.name,
    photoIds: defect.photoIds || [],
  };
}
export function groupDefects(rooms: RoomReport[]) {
  const entries = rooms.flatMap((room, roomIndex) =>
    (room.defects || []).map((defect, defectIndex) => ({
      ...defectFields(defect, room),
      roomIndex,
      defectIndex,
    })),
  );
  const trades = [...new Set(entries.map((d) => d.trade))].sort((a, b) =>
    a === UNASSIGNED_TRADE
      ? 1
      : b === UNASSIGNED_TRADE
        ? -1
        : a.localeCompare(b, "de"),
  );
  return trades.map((trade) => ({
    trade,
    defects: entries
      .filter((d) => d.trade === trade)
      .sort(
        (a, b) =>
          a.location.localeCompare(b.location, "de") ||
          a.roomIndex - b.roomIndex ||
          a.defectIndex - b.defectIndex,
      ),
  }));
}
