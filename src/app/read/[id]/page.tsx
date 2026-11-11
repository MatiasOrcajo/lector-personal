import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { cache } from "react"
import { ReaderWrapper } from "@/components/reader-wrapper"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

/** Deduplicado por request: lo usan generateMetadata y la página. */
const getBook = cache(async (id: string, userId: string) =>
  prisma.book.findFirst({ where: { id, userId } })
)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return {}
  const { id } = await params
  const book = await getBook(id, userId)
  return book ? { title: book.displayTitle ?? book.title } : {}
}

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    redirect("/login")
  }

  const { id } = await params

  const book = await getBook(id, userId)

  if (!book) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-lg font-medium">Libro no encontrado</p>
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Volver a la biblioteca
        </Link>
      </div>
    )
  }

  return (
    <ReaderWrapper
      url={book.blobUrl}
      format={book.format}
      // El título renombrado por el usuario tiene prioridad sobre el original.
      title={book.displayTitle ?? book.title}
      bookId={book.id}
      initialLocation={book.lastLocation}
    />
  )
}
