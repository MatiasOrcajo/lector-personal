"use server"

import { put } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"

const ALLOWED_FORMATS = ["pdf", "epub"]

export async function uploadBook(formData: FormData) {
  const file = formData.get("file") as File | null

  if (!file) {
    return { error: "No file provided" }
  }

  const extension = file.name.split(".").pop()?.toLowerCase()
  if (!extension || !ALLOWED_FORMATS.includes(extension)) {
    return { error: "Only PDF and EPUB files are allowed" }
  }

  try {
    const blob = await put(file.name, file, {
      access: "private",
      addRandomSuffix: true,
    })

    await prisma.book.create({
      data: {
        title: file.name,
        format: extension as "pdf" | "epub",
        blobUrl: blob.url,
      },
    })

    revalidatePath("/")

    return { success: true }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Upload failed",
    }
  }
}
