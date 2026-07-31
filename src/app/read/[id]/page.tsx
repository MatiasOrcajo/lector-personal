import Link from "next/link"
import { redirect } from "next/navigation"
import { ReaderWrapper } from "@/components/reader-wrapper"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

export const dynamic = "force-dynamic"

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

  const book = await prisma.book.findFirst({
    where: { id, userId },
  })

  if (!book) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
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
      title={book.title}
    />
  )
}
