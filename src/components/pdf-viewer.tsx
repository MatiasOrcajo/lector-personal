"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react"
import {
  loadViewerSettings,
  saveViewerSettings,
  type PdfZoomMode,
} from "@/lib/viewer-settings"

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

const ZOOM_OPTIONS: { label: string; value: PdfZoomMode | number }[] = [
  { label: "Ajustar ancho", value: "fit-width" },
  { label: "Ajustar página", value: "fit-page" },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "125%", value: 1.25 },
  { label: "150%", value: 1.5 },
  { label: "200%", value: 2 },
]

type PdfViewerProps = {
  url: string
  initialPage?: number
  onPageChange?: (page: number) => void
}

export function PdfViewer({ url, initialPage = 1, onPageChange }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(() =>
    Math.max(1, initialPage)
  )
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>(() =>
    loadViewerSettings().pdfZoomMode
  )
  const [zoom, setZoom] = useState(() => loadViewerSettings().pdfZoom)
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollSize, setScrollSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const settings = loadViewerSettings()
    settings.pdfZoomMode = zoomMode
    settings.pdfZoom = zoom
    saveViewerSettings(settings)
  }, [zoomMode, zoom])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setScrollSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const onDocumentLoadSuccess = useCallback((pdf: PDFDocumentProxy) => {
    setNumPages(pdf.numPages)
    pdfRef.current = pdf
  }, [])

  useEffect(() => {
    const pdf = pdfRef.current
    if (!pdf) return
    let cancelled = false
    pdf
      .getPage(Math.min(pageNumber, pdf.numPages))
      .then((page) => {
        if (cancelled) return
        const vp = page.getViewport({ scale: 1 })
        setViewport({ width: vp.width, height: vp.height })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pageNumber, numPages])

  const goTo = useCallback(
    (page: number) => {
      const next = Math.min(Math.max(1, page), numPages ?? 1)
      setPageNumber(next)
      onPageChange?.(next)
    },
    [numPages, onPageChange]
  )

  const scale = useMemo(() => {
    if (!viewport) return null
    const pad = 32
    const cw = Math.max(scrollSize.width - pad, 100)
    const ch = Math.max(scrollSize.height - pad, 100)
    if (zoomMode === "fit-width") return cw / viewport.width
    if (zoomMode === "fit-page") {
      return Math.min(cw / viewport.width, ch / viewport.height)
    }
    return zoom
  }, [viewport, zoomMode, zoom, scrollSize])

  const handleZoomChange = useCallback(
    (value: string) => {
      const option = ZOOM_OPTIONS.find((o) => String(o.value) === value)
      if (!option) return
      if (option.value === "fit-width" || option.value === "fit-page") {
        setZoomMode(option.value)
      } else {
        setZoom(option.value as number)
        setZoomMode("custom")
      }
    },
    []
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-b px-4 py-2">
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
        <select
          value={String(zoomMode === "custom" ? zoom : zoomMode)}
          onChange={(e) => handleZoomChange(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Zoom"
        >
          {ZOOM_OPTIONS.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col items-center overflow-auto bg-muted/40 p-4"
      >
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
          {scale ? (
            <Page
              className="pdf-page"
              pageNumber={pageNumber}
              scale={scale}
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
          ) : (
            <div className="flex items-center gap-2 py-20 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
              <span>Calculando vista…</span>
            </div>
          )}
        </Document>
      </div>
    </div>
  )
}
