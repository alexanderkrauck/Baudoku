export interface Defect {
  id: string;
  trade?: string;
  tradeSuggestion?: string;
  location?: string;
  photoIds?: string[];
  description: string;
  status: "open" | "done";
}
export interface RoomReport {
  defects?: Defect[];
  name: string;
  transcription: string;
  summary: string;
  photoIds: string[];
  tags?: string[];
  startTimeMs?: number;
  endTimeMs?: number;
  photoUrls?: string[]; // Legacy Drive IDs
}
export interface ReportData {
  id: string;
  date: string;
  updatedAt?: string;
  projectName?: string;
  title: string;
  summary: string;
  rooms: RoomReport[];
  status?: "pending" | "analyzing" | "completed" | "error";
  error?: string;
  durationMs?: number;
  captureState?: "recording" | "paused" | "stopped";
  rawAudioUrl?: string; // Legacy name: a private Drive file ID, not a URL
  rawAudioParts?: { id: string; startTimeMs: number; durationMs: number }[];
  rawPhotoUrls?: string[];
  photos?: {
    id: string;
    relativeTimeMs: number | null;
    driveId?: string;
    annotatedDriveId?: string;
  }[];
  driveFolderId?: string;
  driveReportId?: string;
  driveMarkdownId?: string;
  driveSyncedAt?: string;
}
export interface CapturedPhoto {
  id: string;
  blob: Blob;
  annotatedBlob?: Blob;
  annotations?: PhotoAnnotation[];
  relativeTimeMs: number | null;
}
export interface Draft {
  analysisCache?: Record<string, ReportData>;
  report: ReportData;
  audio?: Blob;
  audioParts?: {
    blob: Blob;
    startTimeMs: number;
    durationMs: number;
    driveId?: string;
  }[];
  audioStartMs?: number;
  audioSequenceFloor?: number;
  photos: CapturedPhoto[];
}
export interface PhotoAnnotation {
  tool: "arrow" | "circle" | "freehand";
  points: { x: number; y: number }[];
}
