/**
 * Draft letter photos, kept on this device in IndexedDB until the letter is sent. That lets
 * anyone build and preview a letter with photos before signing in; photos only leave the device
 * when the sender presses send (then they go to private storage via uploadLetterPhoto).
 * Every call degrades to "no photos" if IndexedDB isn't available (private browsing, old browsers).
 */

const DB = "jg-letter-photos"
const STORE = "photos"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  }).finally(() => db.close())
}

export async function putPhoto(id: string, blob: Blob) {
  await tx("readwrite", (s) => s.put(blob, id))
}

export async function getPhoto(id: string): Promise<Blob | null> {
  try {
    return ((await tx("readonly", (s) => s.get(id))) as Blob | undefined) ?? null
  } catch {
    return null
  }
}

export async function deletePhoto(id: string) {
  try {
    await tx("readwrite", (s) => s.delete(id))
  } catch {
    /* nothing to clean up */
  }
}

export async function clearPhotos() {
  try {
    await tx("readwrite", (s) => s.clear())
  } catch {
    /* nothing to clean up */
  }
}

export const newPhotoId = () => `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
