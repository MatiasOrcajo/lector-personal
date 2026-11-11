import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isBlobUrl } from "@/lib/blob-url"
import { getFromCache, saveToCache } from "@/lib/blob-cache"
import { NextRequest, NextResponse } from "next/server"

/** La portada es privada (requiere sesión): no debe guardarse en caches
 *  compartidas. Además puede ser un SVG extraído de un EPUB, así que se sirve
 *  con CSP restrictiva y nosniff para que abrirla directamente no ejecute JS. */
function coverHeaders(contentType: string): Headers {
  const headers = new Headers()
  headers.set("content-type", contentType)
  headers.set("cache-control", "private, max-age=31536000, immutable")
  headers.set("x-content-type-options", "nosniff")
  headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  return headers
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const book = await prisma.book.findFirst({
    where: { id, userId },
    select: { coverUrl: true },
  })
  if (!book?.coverUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const targetUrl = isBlobUrl(book.coverUrl)
  if (!targetUrl) {
    return NextResponse.json({ error: "Invalid cover url" }, { status: 500 })
  }

  const targetStr = targetUrl.href

  // try cache first
  const cached = await getFromCache(targetStr)
  if (cached) {
    return new NextResponse(new Uint8Array(cached.buffer), {
      status: 200,
      headers: coverHeaders(cached.contentType),
    })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not configured" },
      { status: 500 }
    )
  }

  let blobResponse: Response
  try {
    blobResponse = await fetch(targetUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch cover" }, { status: 502 })
  }

  if (!blobResponse.ok) {
    return new NextResponse(null, { status: blobResponse.status })
  }

  const contentType = blobResponse.headers.get("content-type") ?? "image/jpeg"
  const buffer = Buffer.from(await blobResponse.arrayBuffer())

  // cache for next time
  saveToCache(targetStr, buffer, contentType).catch(() => {})

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: coverHeaders(contentType),
  })
}
