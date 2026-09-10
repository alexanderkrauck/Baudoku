import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
  signInWithPopup,
} from "firebase/auth";
import { auth, provider } from "./firebase";
let accessToken: string | null = null;
let expiresAt = 0;
let tokenOwner: string | null = null;
export function rememberToken(token: string | undefined) {
  accessToken = token || null;
  tokenOwner = token ? auth.currentUser?.uid || null : null;
  expiresAt = token ? Date.now() + 50 * 60 * 1000 : 0;
}
export function driveToken() {
  return tokenOwner &&
    tokenOwner === auth.currentUser?.uid &&
    expiresAt > Date.now()
    ? accessToken
    : null;
}
export async function connectGoogle() {
  const result = auth.currentUser
    ? await reauthenticateWithPopup(auth.currentUser, provider)
    : await signInWithPopup(auth, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  rememberToken(token);
  if (!token)
    throw new Error(
      "Google Drive wurde nicht freigegeben. Bitte erneut verbinden.",
    );
  return token;
}
export function errorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "permission-denied")
    return "Firebase verweigert das Speichern oder Lesen. Bitte die Firestore-Regeln und Datenbank prüfen. Ihre lokale Kopie bleibt erhalten.";
  if (code === "unavailable")
    return "Firebase ist gerade nicht erreichbar. Bitte die Verbindung prüfen und erneut synchronisieren.";
  if (code === "auth/popup-blocked")
    return "Das Anmeldefenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.";
  if (code === "auth/popup-closed-by-user")
    return "Das Anmeldefenster wurde geschlossen. Sie können die Anmeldung erneut starten.";
  if (code === "auth/user-mismatch")
    return "Bitte dasselbe Google-Konto wie bei der Anmeldung verwenden.";
  return error instanceof Error
    ? error.message
    : "Etwas ist schiefgegangen. Bitte erneut versuchen.";
}
