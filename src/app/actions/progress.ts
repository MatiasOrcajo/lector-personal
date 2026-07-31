"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

const MAX_LOCATION_LENGTH = 2048

export async function saveProgress(bookId: string, location: string) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return

  const safeLocation = location.slice(0, MAX_LOCATION_LENGTH).trim()
  if (!safeLocation) return

  await prisma.book.updateMany({
    where: { id: bookId, userId },
    data: { lastLocation: safeLocation },
  })
}
