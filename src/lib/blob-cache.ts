import { createHash } from "crypto"
import { join } from "path"
import { mkdir, readFile, writeFile, unlink, stat, rename, open as fsOpen } from "fs/promises"

const CACHE_DIR = process.env.VERCEL
  ? join("/tmp", "blob-cache")
  : join(process.cwd(), "data", "blob-cache")

interface CacheMeta {
  contentType: string
}

function getCacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex")
}

function getFilePath(key: string): string {
  return join(CACHE_DIR, key)
}

export function getCachePath(url: string): string {
  return getFilePath(getCacheKey(url))
}

function getMetaPath(key: string): string {
  return join(CACHE_DIR, `${key}.meta.json`)
}

async function ensureCacheDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true })
}

async function readMeta(key: string): Promise<CacheMeta | null> {
  try {
    const raw = await readFile(getMetaPath(key), "utf-8")
    return JSON.parse(raw) as CacheMeta
  } catch {
    return null
  }
}

/** Escribe a un temporal y renombra: así un lector concurrente nunca ve un
 *  archivo a medio escribir (rename es atómico en el mismo filesystem). */
async function writeAtomic(path: string, data: Buffer | string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    await writeFile(tmp, data)
    await rename(tmp, path)
  } catch (error) {
    await unlink(tmp).catch(() => {})
    throw error
  }
}

async function writeMeta(key: string, meta: CacheMeta): Promise<void> {
  await ensureCacheDir()
  await writeAtomic(getMetaPath(key), JSON.stringify(meta))
}

async function deleteMeta(key: string): Promise<void> {
  try {
    await unlink(getMetaPath(key))
  } catch {
    // ignore
  }
}

export async function getFromCache(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const key = getCacheKey(url)
    const [buffer, meta] = await Promise.all([readFile(getFilePath(key)), readMeta(key)])
    if (!meta) return null
    return { buffer, contentType: meta.contentType }
  } catch {
    return null
  }
}

export async function getFromCacheRange(
  url: string,
  start: number,
  end: number
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const key = getCacheKey(url)
    const filePath = getFilePath(key)
    const meta = await readMeta(key)
    if (!meta) return null

    const fileStat = await stat(filePath)
    const actualEnd = Math.min(end, fileStat.size - 1)
    const length = actualEnd - start + 1

    if (length <= 0) return null

    const buf = Buffer.alloc(length)
    const handle = await fsOpen(filePath, "r")
    try {
      const { bytesRead } = await handle.read(buf, 0, length, start)
      return { buffer: buf.subarray(0, bytesRead), contentType: meta.contentType }
    } finally {
      await handle.close()
    }
  } catch {
    return null
  }
}

export async function getCacheSize(url: string): Promise<number | null> {
  try {
    const key = getCacheKey(url)
    // Sin meta la entrada no está completa (la meta se escribe al final).
    const meta = await readMeta(key)
    if (!meta) return null
    const fileStat = await stat(getFilePath(key))
    return fileStat.size
  } catch {
    return null
  }
}

export async function saveToCache(
  url: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const key = getCacheKey(url)
  await ensureCacheDir()
  // Primero el contenido y después la meta: la meta marca la entrada como válida.
  await writeAtomic(getFilePath(key), buffer)
  await writeMeta(key, { contentType })
}

export async function deleteFromCache(url: string): Promise<void> {
  const key = getCacheKey(url)
  await Promise.allSettled([
    (async () => { try { await unlink(getFilePath(key)) } catch { /* ok */ } })(),
    deleteMeta(key),
  ])
}

export async function deleteManyFromCache(urls: string[]): Promise<void> {
  await Promise.allSettled(urls.map((url) => deleteFromCache(url)))
}
