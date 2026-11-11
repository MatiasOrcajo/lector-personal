import { Folder, BookOpen, Highlighter } from "lucide-react"
import Link from "next/link"
import { BookCard } from "@/components/book-card"
import { FolderCard } from "@/components/folder-card"
import { prisma } from "@/lib/prisma"

type BookGridProps = {
  userId: string
  folderId?: string
}

/** Grilla de portadas: 2 columnas en mobile (antes 1, con portadas a todo
 *  el ancho que obligaban a scrollear una pantalla por libro). */
const BOOKS_GRID =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
const FOLDERS_GRID =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"
const RECENT_HIGHLIGHTED_LIMIT = 10

export async function BookGrid({ userId, folderId }: BookGridProps) {
  const [books, folders, latestHighlightPerBook] = await Promise.all([
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
    // Un resaltado (el más reciente) por libro, en vez de traer todos.
    prisma.highlight.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      distinct: ["bookId"],
      select: {
        bookId: true,
        createdAt: true,
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

  const mostRecentHighlightAt = new Map<string, number>()
  for (const h of latestHighlightPerBook) {
    mostRecentHighlightAt.set(h.bookId, h.createdAt.getTime())
  }

  const folderList = folders.map((f) => ({ id: f.id, name: f.name }))

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
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Folder className="size-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">
            {folder.name} está vacía
          </p>
          <p className="text-sm text-muted-foreground/60">
            Sube un libro desde aquí o muévelo desde el menú de un libro
          </p>
        </div>
      )
    }

    // Dentro de una carpeta: primero los libros con resaltados más recientes.
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

    return (
      <div className={BOOKS_GRID}>
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
            folders={folderList}
          />
        ))}
      </div>
    )
  }

  const hasContent = books.length > 0 || folders.length > 0

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BookOpen className="size-12 text-muted-foreground/40" />
        <p className="mt-4 text-lg text-muted-foreground">
          Tu biblioteca está vacía
        </p>
        <p className="text-sm text-muted-foreground/60">
          Sube un PDF o EPUB para empezar
        </p>
      </div>
    )
  }

  const recentHighlighted = latestHighlightPerBook.slice(0, RECENT_HIGHLIGHTED_LIMIT)

  return (
    <div className="space-y-8">
      {folders.length > 0 && (
        <div className={FOLDERS_GRID}>
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              id={folder.id}
              name={folder.name}
              bookCount={folder._count.books}
            />
          ))}
        </div>
      )}

      {books.length > 0 && (
        <div className={BOOKS_GRID}>
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
      )}

      {recentHighlighted.length > 0 && (
        <section aria-labelledby="recent-highlighted-heading">
          {/* Antes esta sección no tenía título y parecía una lista duplicada
              de los mismos libros. */}
          <h2
            id="recent-highlighted-heading"
            className="mb-4 flex items-center gap-2 text-lg font-medium"
          >
            <Highlighter className="size-4 text-muted-foreground" />
            Resaltados recientes
          </h2>
          <div className={BOOKS_GRID}>
            {recentHighlighted.map(({ book }) => (
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
        </section>
      )}
    </div>
  )
}
