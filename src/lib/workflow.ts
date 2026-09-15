import { prepareAnalysisPhotos } from "./analysisMedia";
import { getRootFolder } from "./driveSettings";
import { auth } from "./firebase";
import { saveReport, uid } from "./reports";
import { putDraft, putLocal } from "./local";
import {
  createSubFolder,
  uploadFileToFolder,
  downloadDriveFile,
} from "./drive";
import { audioExtension, validateAnalysis } from "../../shared/analysis";
import { reportToMarkdown } from "./markdown";
import type { Draft, ReportData } from "../types";
import { recordingSections, analysisSections } from "./audioSections";

// An operation belongs to the account that started it, including across tab sign-outs.
function ownedOperation() {
  const owner = uid();
  const assertOwner = () => {
    if (auth.currentUser?.uid !== owner)
      throw new Error(
        "Das angemeldete Konto hat sich geändert. Bitte den Vorgang im ursprünglichen Konto erneut starten.",
      );
  };
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    assertOwner();
    try {
      const result = await operation();
      assertOwner();
      return result;
    } catch (error) {
      assertOwner();
      throw error;
    }
  };
  return { owner, assertOwner, run };
}
function localRevision(report: ReportData) {
  report.updatedAt = new Date(
    Math.max(Date.now(), (Date.parse(report.updatedAt || "") || 0) + 1),
  ).toISOString();
}

async function analyzeSection(draft: Draft): Promise<ReportData> {
  const { run } = ownedOperation();
  if (!draft.audio?.size) throw new Error("Keine Audioaufnahme vorhanden.");
  const photos = await run(() =>
    prepareAnalysisPhotos(draft.audio!, draft.photos),
  );
  const form = new FormData();
  form.append(
    "audio",
    draft.audio,
    `aufnahme.${audioExtension(draft.audio.type)}`,
  );
  form.append(
    "photoTimestamps",
    JSON.stringify(
      draft.photos.map((p) => ({ id: p.id, relativeTimeMs: p.relativeTimeMs })),
    ),
  );
  photos.forEach((p) => form.append("photos", p.blob, p.id));
  const token = await run(() => auth.currentUser!.getIdToken());
  const response = await run(() =>
    fetch("/api/analyze", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(240000),
    }),
  );
  const data = await run(() =>
    response.json().catch(() => ({
      error: "Der Server hat keine gültige Antwort geliefert.",
    })),
  );
  if (!response.ok)
    throw new Error(
      data.error || `Analyse fehlgeschlagen (${response.status}).`,
    );
  return {
    ...draft.report,
    ...validateAnalysis(
      data,
      draft.photos.map((p) => p.id),
    ),
    ...(draft.report.projectName?.trim()
      ? { title: draft.report.projectName.trim() }
      : {}),
    status: "completed",
    error: "",
  };
}
export async function analyzeDraft(
  draft: Draft,
  progress: (message: string) => void = () => {},
): Promise<ReportData> {
  const { owner, run } = ownedOperation();
  if (!recordingSections(draft).length)
    throw new Error("Keine Audioaufnahme vorhanden.");
  const rooms: ReportData["rooms"] = [];
  const summaries: string[] = [];
  let suggestedTitle = "";
  const assigned = new Set<string>();
  let index = 0;
  for await (const section of analysisSections(draft)) {
    const selected = draft.photos.filter(
      (p) =>
        !assigned.has(p.id) &&
        (p.relativeTimeMs === null ||
          !section.durationMs ||
          p.relativeTimeMs < section.startTimeMs + section.durationMs),
    );
    selected.forEach((p) => assigned.add(p.id));
    progress(
      `Aufnahmeabschnitt ${index + 1} analysieren … Fertige Abschnitte werden zwischengespeichert.`,
    );
    const input = {
      ...draft,
      audio: section.blob,
      photos: selected.map((p) => ({
        ...p,
        relativeTimeMs:
          p.relativeTimeMs === null
            ? null
            : Math.max(0, p.relativeTimeMs - section.startTimeMs),
      })),
    };
    // Hash actual input, not just length: changed/new photos or resumed audio
    // cannot accidentally reuse an older result. Originals remain untouched.
    const hashes = await Promise.all(
      [section.blob, ...selected.map((p) => p.blob)].map(async (blob) =>
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join(""),
      ),
    );
    const cacheKey = JSON.stringify([
      index,
      section.startTimeMs,
      section.durationMs,
      input.photos.map((p) => [p.id, p.relativeTimeMs]),
      hashes,
    ]);
    const result =
      draft.analysisCache?.[cacheKey] || (await analyzeSection(input));
    draft.analysisCache = { ...draft.analysisCache, [cacheKey]: result };
    await run(() => putDraft(owner, draft));
    summaries.push(result.summary);
    suggestedTitle ||= result.title;
    rooms.push(
      ...result.rooms.map((room) => ({
        ...room,
        ...(room.startTimeMs === undefined
          ? {}
          : { startTimeMs: room.startTimeMs + section.startTimeMs }),
        ...(room.endTimeMs === undefined
          ? {}
          : { endTimeMs: room.endTimeMs + section.startTimeMs }),
        defects: room.defects?.map((d) => ({ ...d, id: `${index}-${d.id}` })),
      })),
    );
    index++;
  }
  // Photos taken after stopping still remain visible even without an audio match.
  const remaining = draft.photos.filter((p) => !assigned.has(p.id));
  if (remaining.length)
    rooms.push({
      name: "Fotos ohne Sprachzuordnung",
      summary: "Bitte die Fotozuordnung prüfen.",
      transcription: "",
      photoIds: remaining.map((p) => p.id),
      tags: [],
    });
  return {
    ...draft.report,
    title: draft.report.projectName || suggestedTitle || draft.report.title,
    summary: summaries.join("\n\n"),
    rooms,
    status: "completed",
    error: "",
  };
}

export async function backupDraft(
  draft: Draft,
  token: string,
  progress: (s: string) => void,
) {
  const { owner, run, assertOwner } = ownedOperation();
  const report = draft.report;
  // Upload checkpoints are local and immediate. syncReport writes the final cloud index once.
  const checkpoint = async () => {
    assertOwner();
    localRevision(report);
    await run(() => putDraft(owner, draft));
    await run(() => putLocal(owner, report));
  };
  if (!report.driveFolderId) {
    const parent = await run(() => getRootFolder(token));
    report.driveFolderId = await run(() =>
      createSubFolder(
        `Begehung ${report.date.slice(0, 10)} – ${report.id}`,
        parent,
        token,
      ),
    );
    await checkpoint();
  }
  for (const [index, part] of (draft.audioParts || []).entries()) {
    if (!part.driveId) {
      progress(`Aufnahmeabschnitt ${index + 1} in Google Drive sichern …`);
      part.driveId = await run(() =>
        uploadFileToFolder(
          part.blob,
          `aufnahme-${index + 1}.${audioExtension(part.blob.type)}`,
          part.blob.type,
          report.driveFolderId!,
          token,
        ),
      );
      await checkpoint();
    }
  }
  report.rawAudioParts = (draft.audioParts || []).map((p) => ({
    id: p.driveId!,
    startTimeMs: p.startTimeMs,
    durationMs: p.durationMs,
  }));
  if (!report.rawAudioUrl && draft.audio) {
    progress("Audio in Google Drive sichern …");
    report.rawAudioUrl = await run(() =>
      uploadFileToFolder(
        draft.audio!,
        `aufnahme.${audioExtension(draft.audio!.type)}`,
        draft.audio!.type,
        report.driveFolderId!,
        token,
      ),
    );
    await checkpoint();
  }
  report.photos ||= draft.photos.map((p) => ({
    id: p.id,
    relativeTimeMs: p.relativeTimeMs,
  }));
  for (let i = 0; i < draft.photos.length; i++) {
    const photo = draft.photos[i];
    let meta = report.photos.find((p) => p.id === photo.id);
    if (!meta) {
      meta = { id: photo.id, relativeTimeMs: photo.relativeTimeMs };
      report.photos.push(meta);
    }
    if (!meta.driveId) {
      progress(`Foto ${i + 1} von ${draft.photos.length} sichern …`);
      meta.driveId = await run(() =>
        uploadFileToFolder(
          photo.blob,
          `${photo.id}.${photo.blob.type.includes("png") ? "png" : photo.blob.type.includes("webp") ? "webp" : "jpg"}`,
          photo.blob.type,
          report.driveFolderId!,
          token,
        ),
      );
      await checkpoint();
    }
    if (photo.annotatedBlob && !meta.annotatedDriveId) {
      progress(`Markierung zu Foto ${i + 1} sichern …`);
      meta.annotatedDriveId = await run(() =>
        uploadFileToFolder(
          photo.annotatedBlob!,
          `${photo.id}-markiert.jpg`,
          "image/jpeg",
          report.driveFolderId!,
          token,
        ),
      );
      await checkpoint();
    }
  }
  assertOwner();
  report.rawPhotoUrls = report.photos.map((p) => p.driveId || "");
  await checkpoint();
  return report;
}
export async function syncReport(report: ReportData, token: string) {
  const { owner, run, assertOwner } = ownedOperation();
  const next = { ...report };
  // Keep completed upload IDs locally and on the caller's report if a later step fails.
  const checkpoint = async () => {
    assertOwner();
    localRevision(next);
    Object.assign(report, next);
    await run(() => putLocal(owner, next));
  };
  if (!next.driveFolderId) {
    const parent = await run(() => getRootFolder(token));
    next.driveFolderId = await run(() =>
      createSubFolder(
        `Begehung ${report.date.slice(0, 10)} – ${report.id}`,
        parent,
        token,
      ),
    );
    await checkpoint();
  }
  next.driveMarkdownId = await run(() =>
    uploadFileToFolder(
      new Blob([reportToMarkdown(next)], {
        type: "text/markdown;charset=utf-8",
      }),
      "bericht.md",
      "text/markdown",
      next.driveFolderId!,
      token,
      next.driveMarkdownId,
    ),
  );
  await checkpoint();
  // Export the Markdown ID with the structured report so another device can update it.
  const syncedAt = new Date().toISOString();
  next.driveReportId = await run(() =>
    uploadFileToFolder(
      new Blob(
        [JSON.stringify({ ...next, driveSyncedAt: syncedAt }, null, 2)],
        { type: "application/json" },
      ),
      "bericht_daten.json",
      "application/json",
      next.driveFolderId!,
      token,
      next.driveReportId,
    ),
  );
  next.driveSyncedAt = syncedAt;
  await checkpoint();
  return { report: next, warning: await run(() => saveReport(next)) };
}
export async function restoreDraft(
  report: ReportData,
  token: string,
): Promise<Draft> {
  const { run } = ownedOperation();
  if (!report.rawAudioUrl && !report.rawAudioParts?.length)
    throw new Error(
      "Keine Audioaufnahme in Drive vorhanden. Bitte den lokalen Entwurf öffnen.",
    );
  const photos =
    report.photos ||
    (report.rawPhotoUrls || []).map((driveId, i) => ({
      id: `photo_${i}`,
      relativeTimeMs: null,
      driveId,
    }));
  const audio = report.rawAudioUrl
    ? await run(() => downloadDriveFile(report.rawAudioUrl!, token))
    : undefined;
  const audioParts = [];
  for (const part of report.rawAudioParts || []) {
    audioParts.push({
      blob: await run(() => downloadDriveFile(part.id, token)),
      startTimeMs: part.startTimeMs,
      durationMs: part.durationMs,
      driveId: part.id,
    });
  }
  const restoredPhotos = await run(() =>
    Promise.all(
      photos.map(async (p) => {
        if (!p.driveId)
          throw new Error(
            "Ein Foto ist noch nicht in Drive gesichert. Bitte den lokalen Entwurf öffnen.",
          );
        return {
          id: p.id,
          relativeTimeMs: p.relativeTimeMs,
          blob: await run(() => downloadDriveFile(p.driveId!, token)),
          ...("annotatedDriveId" in p && p.annotatedDriveId
            ? {
                annotatedBlob: await run(() =>
                  downloadDriveFile(p.annotatedDriveId!, token),
                ),
              }
            : {}),
        };
      }),
    ),
  );
  return {
    report,
    audio,
    audioParts,
    audioStartMs: Math.max(
      0,
      ...audioParts.map((p) => p.startTimeMs + p.durationMs),
    ),
    photos: restoredPhotos,
  };
}
