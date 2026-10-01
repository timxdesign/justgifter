/**
 * Upload preparation (SEC 04): only JPEG/PNG/WebP up to 8 MB are accepted, then the image is
 * re-encoded through a canvas. Re-encoding strips EXIF (including GPS location) and any
 * embedded payloads, and caps the size before it reaches storage.
 */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"]
const MAX_BYTES = 8 * 1024 * 1024

export async function prepareImage(file: File, maxEdge = 1600): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Upload a JPEG, PNG or WebP image.")
  if (file.size > MAX_BYTES) throw new Error("Images must be under 8 MB.")
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file couldn't be read as an image.")
  })
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process the image."))), "image/webp", 0.82))
}
