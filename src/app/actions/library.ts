"use server"

import { del } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { deleteFromCache, deleteManyFromCache } from "@/lib/blob-cache"

export async function deleteBook(bookId: string) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  const book = await prisma.book.findFirst({
    where: { id: bookId, userId },
    select: { id: true, blobUrl: true, coverUrl: true },
  })
  if (!book) return { error: "Book not found" }

  try {
    // También se borra la portada: antes quedaba huérfana en Blob.
    await del([book.blobUrl, book.coverUrl].filter(Boolean) as string[])
  } catch {
    // blob deletion failed but we still want to delete the DB record
  }

  // clean local cache
  deleteFromCache(book.blobUrl).catch(() => {})
  if (book.coverUrl) {
    deleteFromCache(book.coverUrl).catch(() => {})
  }

  await prisma.book.delete({ where: { id: bookId } })

  revalidatePath("/")
  return { success: true }
}

export async function renameBook(bookId: string, displayTitle: string) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  const trimmed = displayTitle.trim().slice(0, 300)
  if (!trimmed) return { error: "Name cannot be empty" }

  const book = await prisma.book.findFirst({
    where: { id: bookId, userId },
    select: { id: true },
  })
  if (!book) return { error: "Book not found" }

  await prisma.book.update({
    where: { id: bookId },
    data: { displayTitle: trimmed },
  })

  revalidatePath("/")
  return { success: true }
}

export async function createFolder(name: string) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  const trimmed = name.trim().slice(0, 100)
  if (!trimmed) return { error: "Folder name cannot be empty" }

  await prisma.folder.create({
    data: { name: trimmed, userId },
  })

  revalidatePath("/")
  return { success: true }
}

export async function renameFolder(folderId: string, name: string) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  const trimmed = name.trim().slice(0, 100)
  if (!trimmed) return { error: "Folder name cannot be empty" }

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  })
  if (!folder) return { error: "Folder not found" }

  await prisma.folder.update({
    where: { id: folderId },
    data: { name: trimmed },
  })

  revalidatePath("/")
  return { success: true }
}

/** Elimina una carpeta. Por defecto los libros vuelven a la biblioteca
 *  (folderId → null por la relación onDelete: SetNull); con
 *  `deleteBooks: true` también se borran los libros y sus archivos. */
export async function deleteFolder(
  folderId: string,
  options: { deleteBooks?: boolean } = {}
) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  })
  if (!folder) return { error: "Folder not found" }

  if (!options.deleteBooks) {
    await prisma.folder.delete({ where: { id: folderId } })
    revalidatePath("/")
    return { success: true }
  }

  const books = await prisma.book.findMany({
    where: { folderId, userId },
    select: { blobUrl: true, coverUrl: true },
  })

  const blobUrls = books.flatMap((b) => [b.blobUrl, b.coverUrl].filter(Boolean) as string[])
  if (blobUrls.length > 0) {
    try {
      await del(blobUrls)
    } catch {
      // blob deletion failed but we still delete the DB records
    }
    // clean local cache for all books in folder
    deleteManyFromCache(blobUrls).catch(() => {})
  }

  await prisma.$transaction([
    prisma.book.deleteMany({ where: { folderId, userId } }),
    prisma.folder.delete({ where: { id: folderId } }),
  ])

  revalidatePath("/")
  return { success: true }
}

export async function moveBookToFolder(bookId: string, folderId: string | null) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  const book = await prisma.book.findFirst({
    where: { id: bookId, userId },
    select: { id: true },
  })
  if (!book) return { error: "Book not found" }

  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, userId },
      select: { id: true },
    })
    if (!folder) return { error: "Folder not found" }
  }

  await prisma.book.update({
    where: { id: bookId },
    data: { folderId },
  })

  revalidatePath("/")
  return { success: true }
}
