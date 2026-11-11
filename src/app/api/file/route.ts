import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isBlobUrl } from "@/lib/blob-url"
import {
  getFromCache,
  getFromCacheRange,
  getCacheSize,
  saveToCache,
} from "@/lib/blob-cache"
import { NextRequest, NextResponse } from "next/server"

type ParsedRange = { start: number; end: number } | "unsatisfiable" | null

/** Interpreta una cabecera Range de un único rango (RFC 9110).
 *  - `null`: cabecera no soportada → se responde el archivo completo (200).
 *  - `"unsatisfiable"`: rango fuera del archivo → 416.
 *  Un `end` mayor al tamaño se recorta (lo permite la RFC). */
function parseRange(rangeHeader: string, fileSize: number): ParsedRange {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (!match[1] && !match[2])) return null

  let start: number
  let end: number
  if (!match[1]) {
    // Sufijo: últimos N bytes
    const suffix = parseInt(match[2], 10)
    if (suffix === 0) return "unsatisfiable"
    start = Math.max(0, fileSize - suffix)
    end = fileSize - 1
  } else {
    start = parseInt(match[1], 10)
    end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1
  }

  if (start >= fileSize || start > end) return "unsatisfiable"
  return { start, end }
}

function unsatisfiable(fileSize: number) {
  const headers = new Headers()
  headers.set("content-range", `bytes */${fileSize}`)
  return new NextResponse(null, { status: 416, headers })
}

function cacheHeaders(): Headers {
  const headers = new Headers()
  headers.set("cache-control", "private, max-age=86400, immutable")
  return headers
}

function rangeHeaders(
  start: number,
  end: number,
  total: number,
  length: number
): Headers {
  const headers = cacheHeaders()
  headers.set("content-range", `bytes ${start}-${end}/${total}`)
  headers.set("content-length", String(length))
  headers.set("accept-ranges", "bytes")
  return headers
}

function fullHeaders(contentType: string, length: number): Headers {
  const headers = cacheHeaders()
  headers.set("content-type", contentType)
  headers.set("content-length", String(length))
  headers.set("accept-ranges", "bytes")
  return headers
}

const inFlightFetches = new Map<
  string,
  Promise<{ buffer: Buffer; contentType: string }>
>()

class BlobFetchError extends Error {
  constructor(public readonly status: number) {
    super(`Failed to fetch blob: ${status}`)
  }
}

/** Deduplica descargas del archivo completo desde Blob Storage.
 *  pdf.js emite varias peticiones Range en paralelo; en cache-miss cada una
 *  disparaba un fetch completo del archivo. Con single-flight, todas las
 *  peticiones concurrentes comparten una sola descarga. */
async function fetchFullFile(targetUrl: string, token: string) {
  const existing = inFlightFetches.get(targetUrl)
  if (existing) return existing

  const promise = (async () => {
    const blobResponse = await fetch(targetUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })

    if (!blobResponse.ok) {
      throw new BlobFetchError(blobResponse.status)
    }

    const contentType =
      blobResponse.headers.get("content-type") ?? "application/octet-stream"
    const buffer = Buffer.from(await blobResponse.arrayBuffer())

    saveToCache(targetUrl, buffer, contentType).catch(() => {})

    return { buffer, contentType }
  })()

  inFlightFetches.set(targetUrl, promise)
  try {
    return await promise
  } finally {
    inFlightFetches.delete(targetUrl)
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rawUrl = request.nextUrl.searchParams.get("url")
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
  }

  const parsedUrl = isBlobUrl(rawUrl)
  if (!parsedUrl) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }

  const targetUrl = parsedUrl.href

  // Solo se sirven archivos de libros del propio usuario: sin este control
  // cualquier sesión válida podía leer blobs privados ajenos conociendo la URL.
  const owned = await prisma.book.findFirst({
    where: { userId, blobUrl: { in: Array.from(new Set([rawUrl, targetUrl])) } },
    select: { id: true },
  })
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not configured" },
      { status: 500 }
    )
  }

  const rangeHeader = request.headers.get("range")

  if (rangeHeader) {
    const cachedSize = await getCacheSize(targetUrl)
    if (cachedSize !== null) {
      const parsed = parseRange(rangeHeader, cachedSize)
      if (parsed === "unsatisfiable") return unsatisfiable(cachedSize)
      if (parsed) {
        const cached = await getFromCacheRange(targetUrl, parsed.start, parsed.end)
        if (cached) {
          return new NextResponse(new Uint8Array(cached.buffer), {
            status: 206,
            headers: rangeHeaders(
              parsed.start,
              parsed.end,
              cachedSize,
              cached.buffer.length
            ),
          })
        }
      }
    }
  } else {
    const cached = await getFromCache(targetUrl)
    if (cached) {
      return new NextResponse(new Uint8Array(cached.buffer), {
        status: 200,
        headers: fullHeaders(cached.contentType, cached.buffer.length),
      })
    }
  }

  // Cache miss — fetch full file from Blob (single-flight)
  let buffer: Buffer | null = null
  let contentType: string

  try {
    const result = await fetchFullFile(targetUrl, token)
    buffer = result.buffer
    contentType = result.contentType
  } catch (error) {
    if (error instanceof BlobFetchError) {
      return new NextResponse(null, { status: error.status })
    }
    return NextResponse.json(
      { error: "Failed to fetch file" },
      { status: 502 }
    )
  }

  if (!buffer) {
    return new NextResponse(null, { status: 502 })
  }

  if (rangeHeader) {
    const parsed = parseRange(rangeHeader, buffer.length)
    if (parsed === "unsatisfiable") return unsatisfiable(buffer.length)
    if (parsed) {
      const sliced = buffer.subarray(parsed.start, parsed.end + 1)
      return new NextResponse(new Uint8Array(sliced), {
        status: 206,
        headers: rangeHeaders(
          parsed.start,
          parsed.end,
          buffer.length,
          sliced.length
        ),
      })
    }
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: fullHeaders(contentType, buffer.length),
  })
}
