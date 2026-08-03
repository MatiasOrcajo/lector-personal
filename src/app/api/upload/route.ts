import { handleUpload } from "@vercel/blob/client"
import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

const ALLOWED_FORMATS = ["pdf", "epub"]

export async function POST(request: NextRequest) {
  const body = await request.json()

  let userId: string | undefined

  if (body.type !== "blob.upload-completed") {
    const session = await auth()
    userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

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
        tokenPayload: JSON.stringify({ userId }),
      }
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      if (!tokenPayload) {
        throw new Error("No token payload provided")
      }

      const { userId: tokenUserId } = JSON.parse(tokenPayload) as { userId: string }

      const extension = blob.pathname.split(".").pop()?.toLowerCase()

      await prisma.book.create({
        data: {
          title: blob.pathname,
          format: extension as "pdf" | "epub",
          blobUrl: blob.url,
          userId: tokenUserId,
        },
      })

      revalidatePath("/")
    },
  })

  return NextResponse.json(result)
}
