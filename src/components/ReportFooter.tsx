export default function ReportFooter({ date }: { date: string }) {
  return (
    <footer className="report-footer">
      <span>
        KRAUCK SYSTEMS | Projektsicherheit für Bauherren &amp; Investoren
      </span>
      <span>
        {new Date(date).toLocaleDateString("de-AT")} · PLANEN. STEUERN.
        REALISIEREN.
      </span>
    </footer>
  );
}
