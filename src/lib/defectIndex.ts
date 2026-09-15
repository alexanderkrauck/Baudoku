import type { ReportData } from "../types";
import { defectFields } from "./defects";
export function defectIndex(reports: ReportData[]) {
  return reports.flatMap((report) =>
    report.rooms.flatMap((room, ri) =>
      (room.defects || []).map((defect, di) => ({
        ...defectFields(defect, room),
        reportId: report.id,
        project: report.projectName || report.title || "Ohne Projekt",
        key: `${report.id}:${ri}:${di}`,
        photos: (defect.photoIds || [])
          .map((id) => report.photos?.find((p) => p.id === id))
          .filter((p) => !!p),
      })),
    ),
  );
}
export function defectCounts(report: ReportData) {
  const rows = defectIndex([report]);
  return {
    open: rows.filter((d) => d.status !== "done").length,
    done: rows.filter((d) => d.status === "done").length,
  };
}
