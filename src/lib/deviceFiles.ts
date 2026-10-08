// Files kept on this device only (IndexedDB): uploaded videos and carousel
// slide images. They never sync; the synced data refers to them by key.
// The database keeps its original name so videos saved before this module
// existed are still found.

const DB = "content-studio-video";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction("files", mode).objectStore("files"));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const putFile = (id: string, file: Blob) => tx("readwrite", (s) => s.put(file, id));
export const getFile = (id: string) => tx<Blob | undefined>("readonly", (s) => s.get(id));
export const deleteFile = (id: string) => tx("readwrite", (s) => s.delete(id));
