"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

const ALLOWED_FORMATS = ["pdf", "epub"]

export async function saveUploadedBook(input: {
  blobUrl: string
  title: string
  format: string
}) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return { error: "Unauthorized" }
  }

  const format = input.format.toLowerCase()
  if (!ALLOWED_FORMATS.includes(format)) {
    return { error: "Only PDF and EPUB files are allowed" }
  }

  try {
    await prisma.book.create({
      data: {
        title: input.title,
        format: format as "pdf" | "epub",
        blobUrl: input.blobUrl,
        userId,
      },
    })

    revalidatePath("/")

    return { success: true }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to save book",
    }
  }
}