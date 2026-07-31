const BLOB_HOST = "blob.vercel-storage.com"

export function isBlobUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== "https:" ||
      (url.hostname !== BLOB_HOST && !url.hostname.endsWith(`.${BLOB_HOST}`))
    ) {
      return null
    }
    return url
  } catch {
    return null
  }
}
