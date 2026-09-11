import type { ReportData } from "../types";
import { groupDefects, UNASSIGNED_TRADE } from "../lib/defects";
export default function ReportHeader({ report }: { report: ReportData }) {
  const groups = groupDefects(report.rooms);
  const open = groups
    .flatMap((g) => g.defects)
    .filter((d) => d.status === "open").length;
  const trades = groups.filter((g) => g.trade !== UNASSIGNED_TRADE).length;
  return (
    <header className="compact-report-header">
      <span className="eyebrow">BAUDOKU / MÄNGELBERICHT</span>
      <dl className="report-facts">
        <div>
          <dt>Projekt</dt>
          <dd>{report.projectName || report.title}</dd>
        </div>
        <div>
          <dt>Begehungsdatum</dt>
          <dd>{new Date(report.date).toLocaleDateString("de-AT")}</dd>
        </div>
        <div>
          <dt>Offene Mängel</dt>
          <dd>{open}</dd>
        </div>
        <div>
          <dt>Gewerke</dt>
          <dd>{trades}</dd>
        </div>
      </dl>
    </header>
  );
}
