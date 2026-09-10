export interface RoomReport {
  name: string;
  transcription: string;
  summary: string;
  photoIds: string[];
  photoUrls?: string[];
}

export interface ReportData {
  id: string;
  date: string;
  title: string;
  summary: string;
  rooms: RoomReport[];
}

export interface CapturedPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
  relativeTimeMs: number;
}

export interface SyncConfig {
  rootFolderId: string | null;
}

declare global {
  interface Window {
    google?: any;
  }
}

