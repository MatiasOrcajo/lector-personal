import { auth } from "@/auth"
import { UploadButton } from "@/components/upload-button"
import { BookGrid } from "@/components/book-grid"
import { HighlightsSection } from "@/components/highlights-section"
import { NewFolderDialog } from "@/components/new-folder-dialog"
import { buttonVariants } from "@/components/ui/button"
import { logOut } from "@/app/actions/auth"
import { ThemeToggle } from "@/components/theme-toggle"
import { ArrowLeft, BookOpen, Highlighter, LogOut, Folder } from "lucide-react"
import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; tab?: string }>
}) {
  const session = await auth()
  const userId = session?.user?.id
  const { folder, tab } = await searchParams
  const activeTab = tab === "highlights" ? "highlights" : "library"

  let folderName: string | null = null
  if (folder && userId) {
    const f = await prisma.folder.findFirst({
      where: { id: folder, userId },
      select: { name: true },
    })
    folderName = f?.name ?? null
  }

  let highlights: {
    id: string
    text: string
    color: string
    createdAt: Date
    book: { id: string; title: string; displayTitle: string | null; format: string }
  }[] = []
  if (userId && activeTab === "highlights") {
    highlights = await prisma.highlight.findMany({
      where: { userId },
      include: {
        book: { select: { id: true, title: true, displayTitle: true, format: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:py-8">
      {/* Mobile: fila 1 = título / tema / salir, fila 2 = acciones a lo
          ancho. Desktop: todo en una fila. */}
      <header className="mb-6 flex flex-wrap items-center gap-2 sm:mb-8 sm:gap-3">
        <div className="order-1 mr-auto flex min-w-0 items-center gap-2">
          <BookOpen className="size-6 shrink-0 text-primary" />
          <h1 className="truncate text-xl font-semibold">Lector Personal</h1>
        </div>
        {session?.user?.name && (
          <span className="order-2 hidden text-sm text-muted-foreground lg:inline">
            Hola, {session.user.name}
          </span>
        )}
        <div className="order-3 flex">
          <ThemeToggle variant="responsive" />
        </div>
        <div className="order-5 flex w-full flex-wrap items-center gap-2 *:data-[slot=button]:flex-1 sm:order-4 sm:w-auto sm:gap-3 sm:*:data-[slot=button]:flex-none">
          <UploadButton folderId={folderName ? folder : null} />
          <NewFolderDialog />
        </div>
        <form action={logOut} className="order-4 sm:order-5">
          <button
            type="submit"
            className={buttonVariants({ variant: "outline", size: "lg" })}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </form>
      </header>

      <nav className="mb-6 flex gap-1 border-b">
        <Link
          href="/"
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "library"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="size-4" />
          Biblioteca
        </Link>
        <Link
          href="/?tab=highlights"
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "highlights"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Highlighter className="size-4" />
          Mis Resaltados
        </Link>
      </nav>

      <section>
        {activeTab === "highlights" ? (
          <HighlightsSection
            highlights={highlights.map((h) => ({
              id: h.id,
              text: h.text,
              color: h.color as "yellow" | "green" | "blue" | "pink" | "orange",
              createdAt: h.createdAt,
              book: h.book,
            }))}
          />
        ) : (
          <>
            {folder && folderName && (
              <nav aria-label="Ruta" className="mb-4 flex min-w-0 items-center gap-1">
                <Link
                  href="/"
                  className="-ml-2 flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  Biblioteca
                </Link>
                <span className="text-sm text-muted-foreground">/</span>
                <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
                  <Folder className="size-3.5 shrink-0" />
                  <span className="truncate">{folderName}</span>
                </span>
              </nav>
            )}
            {!folder && (
              <h2 className="mb-4 text-lg font-medium">Biblioteca</h2>
            )}
            <Suspense
              fallback={
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[3/5] animate-pulse rounded-xl bg-muted"
                    />
                  ))}
                </div>
              }
            >
              {userId ? <BookGrid userId={userId} folderId={folder} /> : null}
            </Suspense>
          </>
        )}
      </section>
    </div>
  )
}
