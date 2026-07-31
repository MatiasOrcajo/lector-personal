"use client"

import { useCallback, useEffect, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react"

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

export function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [width, setWidth] = useState<number>(() =>
    typeof window === "undefined" ? 800 : Math.min(window.innerWidth - 96, 960)
  )

  useEffect(() => {
    const onResize = () => {
      setWidth(Math.min(window.innerWidth - 96, 960))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: total }: { numPages: number }) => {
      setNumPages(total)
      setPageNumber(1)
    },
    []
  )

  const goTo = useCallback(
    (page: number) => {
      setPageNumber(Math.min(Math.max(1, page), numPages ?? 1))
    },
    [numPages]
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-center gap-3 border-b px-4 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goTo(pageNumber - 1)}
          disabled={pageNumber <= 1}
        >
          <ChevronLeft />
          Anterior
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground">
          Página {pageNumber} de {numPages ?? "—"}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => goTo(pageNumber + 1)}
          disabled={numPages !== null && pageNumber >= numPages}
        >
          Siguiente
          <ChevronRight />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-auto bg-muted/40 p-4">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center gap-2 py-20 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
              <span>Cargando PDF…</span>
            </div>
          }
          error={
            <div className="py-20 text-center text-destructive">
              Error al cargar el PDF
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={
              <div className="flex items-center gap-2 py-20 text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" />
                <span>Renderizando página…</span>
              </div>
            }
            error={
              <div className="py-20 text-center text-destructive">
                Error al renderizar la página
              </div>
            }
          />
        </Document>
      </div>
    </div>
  )
}
