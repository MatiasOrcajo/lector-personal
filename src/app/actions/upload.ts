"use server"

import { del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { isBlobUrl } from "@/lib/blob-url"

const ALLOWED_FORMATS = ["pdf", "epub"]
const MAX_TITLE_LENGTH = 300

/** Título legible a partir del nombre de archivo: sin extensión y sin
 *  guiones bajos usados como separadores. */
function titleFromFileName(name: string): string {
  const withoutExt = name.replace(/\.(pdf|epub)$/i, "")
  const cleaned = withoutExt.replace(/_+/g, " ").replace(/\s+/g, " ").trim()
  return (cleaned || name).slice(0, MAX_TITLE_LENGTH)
}

export async function saveUploadedBook(input: {
  blobUrl: string
  title: string
  format: string
  folderId?: string | null
}) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión." }
  }

  const format = input.format.toLowerCase()
  if (!ALLOWED_FORMATS.includes(format)) {
    return { error: "Solo se permiten archivos PDF y EPUB." }
  }

  // La URL llega del cliente: solo se aceptan URLs del Blob Storage.
  if (!isBlobUrl(input.blobUrl)) {
    return { error: "URL de archivo inválida." }
  }

  let folderId: string | null = null
  if (input.folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: input.folderId, userId },
      select: { id: true },
    })
    folderId = folder?.id ?? null
  }

  try {
    await prisma.book.create({
      data: {
        title: titleFromFileName(input.title),
        format: format as "pdf" | "epub",
        blobUrl: input.blobUrl,
        folderId,
        userId,
      },
    })

    revalidatePath("/")

    return { success: true }
  } catch {
    // Evita dejar el archivo huérfano en Blob si falla la inserción.
    await del(input.blobUrl).catch(() => {})
    return { error: "No se pudo guardar el libro." }
  }
}
