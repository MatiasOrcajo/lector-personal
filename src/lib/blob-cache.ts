import { createHash } from "crypto"
import { join } from "path"
import { mkdir, readFile, writeFile, unlink, stat, open as fsOpen } from "fs/promises"

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

async function writeMeta(key: string, meta: CacheMeta): Promise<void> {
  await ensureCacheDir()
  await writeFile(getMetaPath(key), JSON.stringify(meta), "utf-8")
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

    const buf = Buffer.alloc(length)
    const handle = await fsOpen(filePath, "r")
    await handle.read(buf, 0, length, start)
    await handle.close()

    return { buffer: buf, contentType: meta.contentType }
  } catch {
    return null
  }
}

export async function getCacheSize(url: string): Promise<number | null> {
  try {
    const key = getCacheKey(url)
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
  await Promise.all([
    writeFile(getFilePath(key), buffer),
    writeMeta(key, { contentType }),
  ])
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
