# Baudoku: Wiederherstellung ohne Büro-PC

Diese Anleitung beschreibt, wie Baudoku von einem neuen Entwicklungsrechner weiterentwickelt werden kann. Sie enthält keine Zugangsdaten, internen Projektkennungen oder Betriebsdetails.

## Was zentral gesichert ist

| Bereich | Zentraler Ort | Zweck |
| --- | --- | --- |
| Programmcode und Versionsgeschichte | Dieses GitHub-Repository | Entwicklung, Prüfung und Wiederherstellung |
| Live-Anwendung | Verwaltete Cloud-Laufzeit | Öffentliche Baudoku-Anwendung und Backend |
| Anmeldung und Berichtsübersicht | Verwalteter Firebase-Dienst | Benutzeranmeldung und Berichtsliste |
| Aufnahmen und Berichtsexporte | Google Drive des jeweiligen Benutzers | Audio, Fotos sowie JSON- und Markdown-Berichte |
| Server-Schlüssel | Geschützte Laufzeit-Geheimnisverwaltung | KI-Zugang; niemals im Repository ablegen |

Die im Browser benötigte Firebase-Webkonfiguration ist Teil der Anwendung. Sie ist kein Administrator-Schlüssel. Schreib- und Lesezugriffe auf Daten werden durch Anmeldung und Datenbankregeln geschützt.

## Neuer Entwicklungsrechner

1. Git, Node.js 22 und Codex installieren und bei GitHub anmelden.
2. Das Repository klonen, den Entwicklungszweig wählen und die festgeschriebenen Abhängigkeiten installieren:

   ```sh
   git clone https://github.com/alexanderkrauck/Baudoku.git
   cd Baudoku
   git switch development
   npm ci
   npm run lint
   npm test
   ```

3. Änderungen auf `development` testen und nach GitHub sichern. Eine Veröffentlichung erfolgt ausschließlich nach einer ausdrücklichen Freigabe über einen Pull Request nach `main`.
4. Für lokale KI-Tests bei Bedarf eine eigene, nicht eingecheckte `.env` aus `.env.example` erzeugen. Zugangsschlüssel nur lokal oder in einer zugelassenen Geheimnisverwaltung hinterlegen.

`node_modules/`, erzeugte Build-Dateien und lokale Vorschau-Dateien werden nicht versioniert. Sie sind nicht für den Live-Betrieb erforderlich und lassen sich aus dem Repository neu erzeugen.

## Erforderliche kontobezogene Zugriffe

Ein neuer Rechner benötigt keine Dateien des bisherigen Büro-PCs. Die verantwortliche Person benötigt jedoch Zugriffe auf die zentralen Konten:

- Schreibzugriff auf dieses GitHub-Repository;
- Administratorzugriff auf die Cloud-Laufzeit und die Geheimnisverwaltung für Wartungsfälle;
- Zugriff auf Firebase für Anmeldung, Datenbankregeln und Anwendungsdaten;
- Zugriff auf die jeweiligen Google-Drive-Ordner für vorhandene Begehungen.

Diese Berechtigungen sind an Personen und Konten gebunden, nicht an einen bestimmten Computer. Wer sie vergibt und welche konkreten Kennungen gelten, steht ausschließlich im internen Betriebsblatt.

## Was lokal bleiben darf

Während einer laufenden Aufnahme liegen noch nicht synchronisierte Audioabschnitte und Fotos absichtlich auf dem verwendeten Telefon. Dadurch kann die Aufnahme nach einer Unterbrechung auf diesem Gerät fortgesetzt werden. Erst nach dem Sichern befinden sich die Dateien zusätzlich in Google Drive und der Bericht in der Cloud-Übersicht. Ein noch nicht gesicherter Entwurf ist deshalb auf einem anderen Gerät nicht verfügbar.

Die veröffentlichte Baudoku läuft unabhängig davon weiter, auch wenn kein Entwicklungs-PC eingeschaltet ist.

## Regelmäßige Kontrolle

- Nach Änderungen: Arbeitsstand prüfen, testen, committen und auf `development` sichern.
- Nach einer Freigabe: erfolgreichen automatischen Veröffentlichungslauf kontrollieren.
- Regelmäßig eine Testbegehung vollständig in Drive sichern und den Bericht auf einem zweiten Gerät öffnen.
- Zugriffe, Abrechnung und die interne Betriebsdokumentation mindestens zwei verantwortlichen Personen zugänglich halten.
