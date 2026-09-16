// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
// Reads an arbitrary file (e.g. a PDF) as a base64 data URL, for storing
// directly on a Firestore document — this project has no Firebase Storage
// set up. Unlike images, non-image files can't be resized/compressed, so a
// hard size cap keeps the resulting document safely under Firestore's
// 1 MB-per-document limit (base64 inflates size by ~33%).
export function fileToDataUrl(file, maxBytes = 700 * 1024) {
  return new Promise((resolve, reject) => {
    if (maxBytes && file.size > maxBytes) {
      reject(new Error(`Ukuran file maksimal ${Math.round(maxBytes / 1024)} KB`))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(file)
  })
}
