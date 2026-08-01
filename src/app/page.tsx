import { auth } from "@/auth"
import { UploadButton } from "@/components/upload-button"
import { BookGrid } from "@/components/book-grid"
import { HighlightsSection } from "@/components/highlights-section"
import { NewFolderDialog } from "@/components/new-folder-dialog"
import { buttonVariants } from "@/components/ui/button"
import { logOut } from "@/app/actions/auth"
import { ThemeToggle } from "@/components/theme-toggle"
import { BookOpen, Highlighter, LogOut, Folder } from "lucide-react"
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
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="size-6 text-primary" />
          <h1 className="text-xl font-semibold">Lector Personal</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {session?.user?.name && (
            <span className="text-sm text-muted-foreground">
              Hola, {session.user.name}
            </span>
          )}
          <ThemeToggle />
          <UploadButton />
          <NewFolderDialog />
          <form action={logOut}>
            <button
              type="submit"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <LogOut className="size-4" />
              Cerrar sesion
            </button>
          </form>
        </div>
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
              <div className="mb-4 flex items-center gap-2">
                <Link
                  href="/"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Biblioteca
                </Link>
                <span className="text-sm text-muted-foreground">/</span>
                <span className="flex items-center gap-1 text-sm font-medium">
                  <Folder className="size-3.5" />
                  {folderName}
                </span>
              </div>
            )}
            {!folder && (
              <h2 className="mb-4 text-lg font-medium">Biblioteca</h2>
            )}
            <Suspense
              fallback={
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[120px] animate-pulse rounded-xl bg-muted"
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
