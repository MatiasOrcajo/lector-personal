import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

const BLOB_HOST = "blob.vercel-storage.com"

function isBlobUrl(value: string): URL | null {
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

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rawUrl = request.nextUrl.searchParams.get("url")
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
  }

  const target = isBlobUrl(rawUrl)
  if (!target) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not configured" },
      { status: 500 }
    )
  }

  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
  }
  const range = request.headers.get("range")
  if (range) {
    headers["Range"] = range
  }

  let blobResponse: Response
  try {
    blobResponse = await fetch(target, { headers, cache: "no-store" })
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch file" },
      { status: 502 }
    )
  }

  if (!blobResponse.ok && blobResponse.status !== 206) {
    return new NextResponse(null, { status: blobResponse.status })
  }

  const responseHeaders = new Headers()
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "cache-control",
  ]) {
    const value = blobResponse.headers.get(name)
    if (value) {
      responseHeaders.set(name, value)
    }
  }

  return new NextResponse(blobResponse.body, {
    status: blobResponse.status,
    headers: responseHeaders,
  })
}
