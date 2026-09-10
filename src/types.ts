export interface AppData {
  text: string;
  lastSynced: string | null;
}

declare global {
  interface Window {
    google?: any;
  }
}
