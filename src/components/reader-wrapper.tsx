"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useState } from "react"
import { ReactReader } from "react-reader"
import { Button } from "@/components/ui/button"
import { ArrowLeft, LoaderCircle } from "lucide-react"

const PdfViewer = dynamic<PdfViewerProps>(
  () => import("@/components/pdf-viewer").then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
        <span>Cargando PDF…</span>
      </div>
    ),
  }
)

type PdfViewerProps = { url: string }

export function ReaderWrapper({
  url,
  format,
  title,
}: {
  url: string
  format: string
  title: string
}) {
  const [location, setLocation] = useState<string | null>(null)

  const proxiedUrl = `/api/file?url=${encodeURIComponent(url)}`

  const locationChanged = useCallback((loc: string) => {
    setLocation(loc)
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b bg-background/95 px-4 py-3">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft />
            Volver
          </Button>
        </Link>
        <h1 className="truncate text-sm font-medium sm:text-base">{title}</h1>
      </header>

      <main className="min-h-0 flex-1">
        {format.toLowerCase() === "epub" ? (
          <div className="h-full">
            <ReactReader
              url={proxiedUrl}
              title={title}
              location={location}
              locationChanged={locationChanged}
              loadingView={
                <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                  <LoaderCircle className="size-5 animate-spin" />
                  <span>Cargando EPUB…</span>
                </div>
              }
              errorView={
                <div className="flex h-full items-center justify-center text-destructive">
                  Error al cargar el EPUB
                </div>
              }
            />
          </div>
        ) : format.toLowerCase() === "pdf" ? (
          <PdfViewer url={proxiedUrl} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Formato no soportado: {format}
          </div>
        )}
      </main>
    </div>
  )
}
