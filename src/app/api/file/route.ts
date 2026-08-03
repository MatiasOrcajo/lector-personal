import { auth } from "@/auth"
import { isBlobUrl } from "@/lib/blob-url"
import {
  getFromCache,
  getFromCacheRange,
  getCacheSize,
  saveToCache,
} from "@/lib/blob-cache"
import { NextRequest, NextResponse } from "next/server"

function parseRange(
  rangeHeader: string,
  fileSize: number
): { start: number; end: number } | null {
  const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/)
  if (!match) return null

  const start = parseInt(match[1], 10)
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1

  if (start >= fileSize || end >= fileSize || start > end) return null
  return { start, end }
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

async function fetchAndCache(targetUrl: string, token: string) {
  const blobResponse = await fetch(targetUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })

  if (!blobResponse.ok) {
    return { blobResponse, buffer: null, contentType: "" }
  }

  const contentType = blobResponse.headers.get("content-type") ?? "application/octet-stream"
  const buffer = Buffer.from(await blobResponse.arrayBuffer())

  saveToCache(targetUrl, buffer, contentType).catch(() => {})

  return { blobResponse, buffer, contentType }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
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

  // Cache miss — fetch full file from Blob
  let blobResponse: Response
  let buffer: Buffer | null = null
  let contentType: string

  try {
    const result = await fetchAndCache(targetUrl, token)
    blobResponse = result.blobResponse
    buffer = result.buffer
    contentType = result.contentType
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch file" },
      { status: 502 }
    )
  }

  if (!blobResponse.ok || !buffer) {
    return new NextResponse(null, { status: blobResponse.status })
  }

  if (rangeHeader) {
    const parsed = parseRange(rangeHeader, buffer.length)
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
