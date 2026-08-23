import { handleUpload } from "@vercel/blob/client"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

const ALLOWED_FORMATS = ["pdf", "epub"]

export async function POST(request: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()

  const result = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      const extension = pathname.split(".").pop()?.toLowerCase()
      if (!extension || !ALLOWED_FORMATS.includes(extension)) {
        throw new Error(`Only PDF and EPUB files are allowed, got: ${extension}`)
      }

      return {
        allowedContentTypes: ["application/pdf", "application/epub+zip"],
        maximumSizeInBytes: 50 * 1024 * 1024,
        addRandomSuffix: true,
      }
    },
  })

  return NextResponse.json(result)
}