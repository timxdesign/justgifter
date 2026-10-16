/**
 * Upload preparation (SEC 04): only JPEG, PNG, WebP and HEIC/HEIF are accepted, then the image is
 * re-encoded through a canvas. Re-encoding strips EXIF (including GPS location) and any embedded
 * payloads, applies the camera's orientation, and compresses the image before it reaches storage.
 *
 * HEIC (iPhone photos) is decoded natively where the browser can (Safari); elsewhere a HEIC decoder
 * is loaded on demand, so nobody downloads it unless they pick a HEIC photo.
 */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
const HEIC = /\.(heic|heif)$/i
/** Phone originals (HEIC, high-resolution JPEG) can be large; they shrink a lot once re-encoded. */
const MAX_INPUT_BYTES = 30 * 1024 * 1024

/** For file inputs: lets iPhones hand over HEIC originals instead of converting them first. */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"

export const isHeic = (file: File) => file.type === "image/heic" || file.type === "image/heif" || HEIC.test(file.name)

export interface PrepareOptions {
  /** Longest side, in pixels. */
  maxEdge?: number
  /** Aim for at most this many bytes, lowering quality (then size) until it fits. */
  targetBytes?: number
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    if (!isHeic(file)) throw new Error("That file couldn't be read as an image.")
  }
  try {
    // The CSP-safe build: no eval. It decodes in a worker started from a blob URL (worker-src blob:).
    const { heicTo } = await import("heic-to/csp")
    return await heicTo({ blob: file, type: "bitmap", options: { imageOrientation: "from-image" } })
  } catch {
    throw new Error("That HEIC photo couldn't be read. Try exporting it as a JPEG.")
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process the image."))), type, quality))
}

function draw(bitmap: ImageBitmap, edge: number) {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

const QUALITIES = [0.82, 0.74, 0.66, 0.58]

/**
 * Re-encodes an image as WebP (JPEG where the browser can't encode WebP, such as Safari). With a
 * `targetBytes`, quality steps down and then the image shrinks until it fits; it never grows.
 */
export async function prepareImage(file: File, opts: PrepareOptions | number = {}): Promise<Blob> {
  const { maxEdge = 1600, targetBytes } = typeof opts === "number" ? { maxEdge: opts } : opts
  if (!ACCEPTED.includes(file.type) && !HEIC.test(file.name)) throw new Error("Upload a JPEG, PNG, WebP or HEIC image.")
  if (file.size > MAX_INPUT_BYTES) throw new Error("Images must be under 30 MB.")
  const bitmap = await decode(file)
  try {
    let edge = maxEdge
    let best: Blob | null = null
    for (let round = 0; round < 3; round++) {
      const canvas = draw(bitmap, edge)
      for (const q of targetBytes ? QUALITIES : QUALITIES.slice(0, 1)) {
        let blob = await encode(canvas, "image/webp", q)
        // Browsers that can't encode WebP silently return PNG: use JPEG instead.
        if (blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg", q)
        if (!best || blob.size < best.size) best = blob
        if (!targetBytes || blob.size <= targetBytes) return blob
      }
      edge = Math.round(edge * 0.8)
    }
    return best!
  } finally {
    bitmap.close()
  }
}

/** Letter photos: big enough for a full-screen phone view, small enough to load fast on mobile data. */
export const LETTER_PHOTO: PrepareOptions = { maxEdge: 1600, targetBytes: 450 * 1024 }
