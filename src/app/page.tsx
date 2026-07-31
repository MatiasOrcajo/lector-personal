import { UploadButton } from "@/components/upload-button"
import { BookGrid } from "@/components/book-grid"
import { BookOpen } from "lucide-react"
import { Suspense } from "react"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="size-6 text-primary" />
          <h1 className="text-xl font-semibold">Lector Personal</h1>
        </div>
        <UploadButton />
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
          <BookGrid />
        </Suspense>
      </section>
    </div>
  )
}
