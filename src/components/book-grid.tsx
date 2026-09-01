import { Folder, BookOpen, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BookCard } from "@/components/book-card"
import { FolderCard } from "@/components/folder-card"
import { prisma } from "@/lib/prisma"

type BookGridProps = {
  userId: string
  folderId?: string
}

export async function BookGrid({ userId, folderId }: BookGridProps) {
  const [books, folders, allHighlights] = await Promise.all([
    prisma.book.findMany({
      where: { userId, folderId: folderId ?? null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.folder.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        _count: { select: { books: true } },
      },
    }),
    prisma.highlight.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            displayTitle: true,
            format: true,
            coverUrl: true,
            blobUrl: true,
            folderId: true,
          },
        },
      },
    }),
  ])

  const seenBooks = new Set<string>()
  const highlightedBooks = allHighlights.filter((h) => {
    if (seenBooks.has(h.bookId)) return false
    seenBooks.add(h.bookId)
    return true
  })

  const mostRecentHighlightAt = new Map<string, number>()
  for (const h of allHighlights) {
    if (!mostRecentHighlightAt.has(h.bookId)) {
      mostRecentHighlightAt.set(h.bookId, h.createdAt.getTime())
    }
  }

  const sortedBooks = [...books].sort((a, b) => {
    const aHighlight = mostRecentHighlightAt.get(a.id)
    const bHighlight = mostRecentHighlightAt.get(b.id)
    if (aHighlight !== undefined && bHighlight !== undefined) {
      return bHighlight - aHighlight
    }
    if (aHighlight !== undefined) return -1
    if (bHighlight !== undefined) return 1
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  if (folderId) {
    const folder = folders.find((f) => f.id === folderId)

    if (!folder) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground">Carpeta no encontrada</p>
          <Link href="/" className="mt-2 text-sm underline">
            Volver a la biblioteca
          </Link>
        </div>
      )
    }

    if (books.length === 0) {
      return (
        <div>
          <Link href="/" className="mb-4 inline-flex">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4" />
              Biblioteca
            </Button>
          </Link>
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Folder className="size-12 text-muted-foreground/40" />
            <p className="mt-4 text-lg text-muted-foreground">
              {folder.name} esta vacia
            </p>
          </div>
        </div>
      )
    }

    return (
      <div>
        <Link href="/" className="mb-4 inline-flex">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Biblioteca
          </Button>
        </Link>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedBooks.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title}
              displayTitle={book.displayTitle}
              format={book.format}
              coverUrl={book.coverUrl}
              blobUrl={book.blobUrl}
              folderId={book.folderId}
              folders={folders.map((f) => ({ id: f.id, name: f.name }))}
            />
          ))}
        </div>
      </div>
    )
  }

  const hasContent = books.length > 0 || folders.length > 0

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BookOpen className="size-12 text-muted-foreground/40" />
        <p className="mt-4 text-lg text-muted-foreground">
          Tu biblioteca esta vacia
        </p>
        <p className="text-sm text-muted-foreground/60">
          Sube un PDF o EPUB para empezar
        </p>
      </div>
    )
  }

  const folderList = folders.map((f) => ({ id: f.id, name: f.name }))

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            id={folder.id}
            name={folder.name}
            bookCount={folder._count.books}
          />
        ))}
        {books.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            displayTitle={book.displayTitle}
            format={book.format}
            coverUrl={book.coverUrl}
            blobUrl={book.blobUrl}
            folderId={book.folderId}
            folders={folderList}
          />
        ))}
      </div>

      {highlightedBooks.length > 0 && (
        <div className="mt-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {highlightedBooks.map((h) => {
              const book = h.book
              return (
                <BookCard
                  key={book.id}
                  id={book.id}
                  title={book.title}
                  displayTitle={book.displayTitle}
                  format={book.format}
                  coverUrl={book.coverUrl}
                  blobUrl={book.blobUrl}
                  folderId={book.folderId}
                  folders={folderList}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
