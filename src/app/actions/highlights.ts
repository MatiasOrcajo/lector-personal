"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "orange"

type CreateHighlightInput = {
  bookId: string
  text: string
  color: HighlightColor
  cfi?: string
  pdfPage?: number
  pdfRects?: { x: number; y: number; width: number; height: number }[]
  pageLabel?: string
}

export async function createHighlight(input: CreateHighlightInput) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  const trimmed = input.text.trim()
  if (!trimmed) return { error: "Text cannot be empty" }

  const book = await prisma.book.findFirst({
    where: { id: input.bookId, userId },
    select: { id: true },
  })
  if (!book) return { error: "Book not found" }

  const highlight = await prisma.highlight.create({
    data: {
      text: trimmed,
      color: input.color,
      cfi: input.cfi ?? null,
      pdfPage: input.pdfPage ?? null,
      pdfRects: input.pdfRects ?? undefined,
      pageLabel: input.pageLabel ?? null,
      userId,
      bookId: input.bookId,
    },
  })

  revalidatePath(`/read/${input.bookId}`)
  revalidatePath("/")
  return { success: true, highlight }
}

export async function deleteHighlight(highlightId: string) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: "Unauthorized" }

  const highlight = await prisma.highlight.findFirst({
    where: { id: highlightId, userId },
    select: { id: true, bookId: true },
  })
  if (!highlight) return { error: "Highlight not found" }

  await prisma.highlight.delete({ where: { id: highlightId } })

  revalidatePath(`/read/${highlight.bookId}`)
  revalidatePath("/")
  return { success: true }
}

export async function getBookHighlights(bookId: string) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []

  return prisma.highlight.findMany({
    where: { bookId, userId },
    orderBy: { createdAt: "asc" },
  })
}

export async function getAllUserHighlights() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return []

  return prisma.highlight.findMany({
    where: { userId },
    include: {
      book: {
        select: { id: true, title: true, displayTitle: true, format: true, coverUrl: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}
