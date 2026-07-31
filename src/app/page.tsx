import { auth } from "@/auth"
import { UploadButton } from "@/components/upload-button"
import { BookGrid } from "@/components/book-grid"
import { Button } from "@/components/ui/button"
import { logOut } from "@/app/actions/auth"
import { BookOpen, LogOut } from "lucide-react"
import { Suspense } from "react"

export const dynamic = "force-dynamic"

export default async function Home() {
  const session = await auth()
  const userId = session?.user?.id

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
          <UploadButton />
          <form action={logOut}>
            <Button variant="outline" size="lg">
              <LogOut className="size-4" />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-medium">Library</h2>
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
          {userId ? <BookGrid userId={userId} /> : null}
        </Suspense>
      </section>
    </div>
  )
}
