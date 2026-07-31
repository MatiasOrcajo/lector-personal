"use server"

import { put } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

const COVER_HEADER_PATTERN =
  /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64$/
const MAX_COVER_BYTES = 3 * 1024 * 1024

export async function uploadCover(bookId: string, dataUrl: string) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return { error: "Unauthorized" }
  }

  const book = await prisma.book.findFirst({
    where: { id: bookId, userId },
    select: { id: true, coverUrl: true },
  })
  if (!book) {
    return { error: "Book not found" }
  }
  if (book.coverUrl) {
    return { success: true }
  }

  const [header, payload] = dataUrl.split(",")
  const match = header ? COVER_HEADER_PATTERN.exec(header) : null
  if (!match || typeof payload !== "string") {
    return { error: "Invalid cover data" }
  }

  const mime = match[1]
  const buffer = Buffer.from(payload, "base64")
  if (buffer.length === 0 || buffer.length > MAX_COVER_BYTES) {
    return { error: "Invalid cover size" }
  }

  const ext =
    mime === "image/jpeg" ? "jpg" : mime === "image/svg+xml" ? "svg" : mime.split("/")[1]

  try {
    const blob = await put(`covers/${bookId}.${ext}`, buffer, {
      access: "private",
      contentType: mime,
    })

    await prisma.book.update({
      where: { id: bookId },
      data: { coverUrl: blob.url },
    })

    revalidatePath("/")

    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Cover upload failed" }
  }
}
