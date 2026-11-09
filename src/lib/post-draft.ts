// Keeps an unfinished "Post your property" form in the browser, so a refresh, a
// tab that the phone kills while the owner looks for photos, or an accidental
// back-swipe doesn't throw away five minutes of typing.
//
// Text fields and the current step go to localStorage; the photos (File objects)
// go to IndexedDB, which can hold blobs. Everything is best effort: storage can
// be missing or full (private mode, old browsers), and the wizard works without it.
// Client-side only: call these from effects or event handlers.

const KEY = "brixora.post-draft.v1";
const DB_NAME = "brixora-post-draft";
const STORE = "photos";

export type DraftRecord<F> = { form: F; step: number; name: string; savedAt: number };
export type DraftPhoto = { id: string; file: File };

export function loadDraft<F>(): DraftRecord<F> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftRecord<F>;
    if (!d || typeof d !== "object" || !d.form) return null;
    // Drafts older than 7 days are stale; a property's details may have changed.
    if (Date.now() - (d.savedAt || 0) > 7 * 24 * 60 * 60_000) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDraft<F>(form: F, step: number, name: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ form, step, name, savedAt: Date.now() } satisfies DraftRecord<F>));
  } catch {
    // Storage full or blocked: the form still works, it just won't survive a refresh.
  }
}

export async function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  try {
    const db = await openDb();
    await tx(db, "readwrite", (s) => s.clear());
    db.close();
  } catch {}
}

export async function loadPhotos(): Promise<DraftPhoto[]> {
  try {
    const db = await openDb();
    const rows = await tx<{ id: string; order: number; blob: Blob; name: string; type: string }[]>(db, "readonly", (s) => s.getAll());
    db.close();
    return rows
      .sort((a, b) => a.order - b.order)
      .map((r) => ({ id: r.id, file: new File([r.blob], r.name || "photo", { type: r.type || r.blob.type }) }));
  } catch {
    return [];
  }
}

export async function savePhotos(photos: DraftPhoto[]) {
  try {
    const db = await openDb();
    await tx(db, "readwrite", (s) => {
      s.clear();
      photos.forEach((p, order) => s.put({ id: p.id, order, blob: p.file, name: p.file.name, type: p.file.type }));
      return s.count();
    });
    db.close();
  } catch {
    // Quota or private mode: photos won't survive a refresh, text still will.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no IndexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T = unknown>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
