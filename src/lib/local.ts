import { createStore, get, set, del, entries, update } from "idb-keyval";
import type { Draft, ReportData } from "../types";
const store = createStore("baudoku", "workspace");
const key = (uid: string, id: string) => `${uid}:report:${id}`;
export interface LocalReport {
  report: ReportData;
  dirty: boolean;
}
const listeners = new Set<(uid: string) => void>();
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("baudoku:local-reports")
    : null;
function emit(uid: string, broadcast = true) {
  for (const listener of listeners) listener(uid);
  if (broadcast) channel?.postMessage(uid);
}
if (channel)
  channel.onmessage = (event) => {
    if (typeof event.data === "string") emit(event.data, false);
  };
export function watchLocalReports(uid: string, onChange: () => void) {
  const listener = (changedUser: string) => {
    if (uid === changedUser) onChange();
  };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function putLocal(uid: string, report: ReportData, dirty = true) {
  await set(key(uid, report.id), { report, dirty }, store);
  emit(uid);
}
// Check and update in one IndexedDB transaction: an older cloud response must not
// replace an edit that was saved while the network request was in flight.
export async function acceptRemoteReport(uid: string, report: ReportData) {
  let changed = false;
  await update<LocalReport>(
    key(uid, report.id),
    (existing) => {
      const sameRevision =
        !!report.updatedAt && report.updatedAt === existing?.report.updatedAt;
      if (existing?.dirty && !sameRevision) return existing;
      const remoteTime = Date.parse(report.updatedAt || report.date) || 0;
      const localTime = existing
        ? Date.parse(existing.report.updatedAt || existing.report.date) || 0
        : 0;
      if (existing && remoteTime < localTime) return existing;
      changed = true;
      return { report, dirty: false };
    },
    store,
  );
  if (changed) emit(uid);
}
export const getLocal = (uid: string, id: string) =>
  get<LocalReport>(key(uid, id), store);
export async function listLocal(uid: string) {
  return (await entries<string, LocalReport>(store))
    .filter(([k]) => k.startsWith(`${uid}:report:`))
    .map(([, v]) => v);
}
export const putDraft = (uid: string, draft: Draft) =>
  set(`${uid}:draft`, draft, store);
export const getDraft = (uid: string) => get<Draft>(`${uid}:draft`, store);
export const deleteDraft = (uid: string) => del(`${uid}:draft`, store);
