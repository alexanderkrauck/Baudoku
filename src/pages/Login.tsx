import { useState } from "react";
import {
  ArrowRight,
  Check,
  Mic,
  Camera,
  FileText,
  Loader2,
} from "lucide-react";
import { connectGoogle, errorMessage } from "../lib/session";
import { Brand, Notice } from "../components/UI";
export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setLoading(true);
    setError("");
    try {
      await connectGoogle();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <div className="story-content">
          <span className="eyebrow">WENIGER SCHREIBTISCH. MEHR BAUSTELLE.</span>
          <h1>
            Vor Ort erfassen.
            <br />
            Alles im <em>Blick.</em>
          </h1>
          <p>
            Sprich deine Beobachtungen ein, halte Details im Bild fest und mach
            daraus eine klare Baudokumentation.
          </p>
          <div className="story-flow">
            <span>
              <Mic /> Sprechen
            </span>
            <i />
            <span>
              <Camera /> Festhalten
            </span>
            <i />
            <span>
              <FileText /> Dokumentieren
            </span>
          </div>
          <div className="blueprint" aria-hidden="true">
            <div className="plan-room r1">01 / WOHNEN</div>
            <div className="plan-room r2">02 / FLUR</div>
            <div className="plan-room r3">03 / KÜCHE</div>
            <span className="plan-pin p1">1</span>
            <span className="plan-pin p2">2</span>
            <span className="plan-dimension">
              DEIN RUNDGANG. RAUM FÜR RAUM.
            </span>
          </div>
        </div>
        <span className="story-foot">
          VOM ERSTEN BEFUND BIS ZUM FERTIGEN BERICHT.
        </span>
      </div>
      <div className="login-form">
        <div className="login-card">
          <span className="eyebrow">DEIN ARBEITSBEREICH</span>
          <h2>
            Gut dokumentiert.
            <br />
            Einfach weiterbauen.
          </h2>
          <p className="muted">
            Melde dich mit Google an. Deine Begehungen und Originalaufnahmen
            bleiben in deinem Drive.
          </p>
          <button
            className="btn btn-primary login-button"
            onClick={login}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="spin" />
            ) : (
              <span className="google-g">G</span>
            )}
            {loading ? "Verbindung wird hergestellt …" : "Mit Google starten"}
            <ArrowRight size={18} />
          </button>
          {error && <Notice>{error}</Notice>}
          <div className="login-benefits">
            <p>
              <Check /> Audio und Fotos an einem Ort
            </p>
            <p>
              <Check /> KI-Berichte zum Prüfen und Bearbeiten
            </p>
            <p>
              <Check /> Speicherort in Google Drive frei wählen
            </p>
          </div>
          <p className="small muted">
            Für die Analyse werden deine ausgewählten Aufnahmen an Google Gemini
            übermittelt. KI-Befunde bitte vor der Weitergabe prüfen.
          </p>
        </div>
        <span className="login-bottom">
          Für den Alltag auf der Baustelle gemacht.
        </span>
      </div>
    </div>
  );
}
