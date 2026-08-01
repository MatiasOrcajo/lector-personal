"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { useSwipeable } from "react-swipeable"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react"
import {
  loadViewerSettings,
  saveViewerSettings,
  getEffectiveHighlightColor,
  type PdfZoomMode,
  type HighlightColor,
} from "@/lib/viewer-settings"
import { HighlightPopover } from "@/components/highlight-popover"
import { useThemeMode } from "@/components/theme-provider"

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

type HighlightRect = { x: number; y: number; width: number; height: number }

export type PdfHighlight = {
  id: string
  text: string
  color: HighlightColor
  pdfRects: HighlightRect[] | null
  pdfPage: number | null
  pageLabel: string | null
}

export type PdfViewerApi = {
  goToPage: (page: number) => void
  getCurrentPage: () => number
  getNumPages: () => number | null
}

type PdfViewerProps = {
  url: string
  initialPage?: number
  onPageChange?: (page: number) => void
  onTotalPagesChange?: (total: number) => void
  bookId: string
  highlights: PdfHighlight[]
  onCreateHighlight: (highlight: PdfHighlight) => void
  onDeleteHighlight: (highlightId: string) => void
  onReady: (api: PdfViewerApi) => void
  isMobile?: boolean
}

export function PdfViewer({
  url,
  initialPage = 1,
  onPageChange,
  onTotalPagesChange,
  bookId,
  highlights,
  onCreateHighlight,
  onDeleteHighlight,
  onReady,
  isMobile = false,
}: PdfViewerProps) {
  const { mode } = useThemeMode()
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(() =>
    Math.max(1, initialPage)
  )
  const pageNumberRef = useRef(pageNumber)
  const numPagesRef = useRef<number | null>(null)

  useEffect(() => {
    pageNumberRef.current = pageNumber
  }, [pageNumber])

  useEffect(() => {
    numPagesRef.current = numPages
  }, [numPages])

  const [zoomMode, setZoomMode] = useState<PdfZoomMode>(() =>
    loadViewerSettings().pdfZoomMode
  )
  const [zoom, setZoom] = useState(() => loadViewerSettings().pdfZoom)
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const [scrollSize, setScrollSize] = useState({ width: 0, height: 0 })

  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null)
  const [selectionText, setSelectionText] = useState<string>("")

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

  const goTo = useCallback(
    (page: number) => {
      const next = Math.min(Math.max(1, page), numPages ?? 1)
      setPageNumber(next)
      onPageChange?.(next)
    },
    [numPages, onPageChange]
  )

  const apiRef = useRef<PdfViewerApi>({
    goToPage: () => {},
    getCurrentPage: () => pageNumberRef.current,
    getNumPages: () => numPagesRef.current,
  })

  useEffect(() => {
    apiRef.current.goToPage = goTo
    apiRef.current.getCurrentPage = () => pageNumberRef.current
    apiRef.current.getNumPages = () => numPagesRef.current
  })

  useEffect(() => {
    onReady(apiRef.current)
  }, [onReady])

  const onDocumentLoadSuccess = useCallback((pdf: PDFDocumentProxy) => {
    setNumPages(pdf.numPages)
    pdfRef.current = pdf
    onTotalPagesChange?.(pdf.numPages)
  }, [onTotalPagesChange])

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

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        return
      }

      const pageEl = pageRef.current
      if (!pageEl || !pageEl.contains(selection.anchorNode)) return

      const text = selection.toString().trim()
      if (!text) return

      const range = selection.getRangeAt(0)
      const rects = range.getClientRects()
      if (rects.length === 0) return

      const firstRect = rects[0]
      setPopover({
        x: firstRect.left + firstRect.width / 2,
        y: firstRect.top + window.scrollY,
      })
      setSelectionText(text)
    }, 0)
  }, [])

  const handleColorSelect = useCallback(
    (color: HighlightColor) => {
      const selection = window.getSelection()
      if (!selection || !selectionText) {
        setPopover(null)
        return
      }

      const pageEl = pageRef.current
      if (!pageEl) {
        setPopover(null)
        return
      }

      const range = selection.getRangeAt(0)
      const rects = range.getClientRects()
      const pageRect = pageEl.getBoundingClientRect()

      const pdfRects: HighlightRect[] = Array.from(rects).map((r) => ({
        x: r.left - pageRect.left,
        y: r.top - pageRect.top,
        width: r.width,
        height: r.height,
      }))

      import("@/app/actions/highlights").then(({ createHighlight: create }) => {
        create({
          bookId,
          text: selectionText,
          color,
          pdfPage: pageNumber,
          pdfRects,
          pageLabel: pageNumber ? `Página ${pageNumber}` : undefined,
        }).then((result) => {
          if (result.success && result.highlight) {
            onCreateHighlight({
              id: result.highlight.id,
              text: selectionText,
              color,
              pdfRects,
              pdfPage: pageNumber,
              pageLabel: result.highlight.pageLabel ?? null,
            })
          }
        })
      })

      selection.removeAllRanges()
      setPopover(null)
      setSelectionText("")
    },
    [bookId, pageNumber, selectionText, onCreateHighlight]
  )

  const pageHighlights = highlights.filter((h) => h.pdfPage === pageNumber)

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => goTo(pageNumber + 1),
    onSwipedRight: () => goTo(pageNumber - 1),
    delta: 30,
    trackMouse: isMobile,
  })
  const { ref: swipeRef, ...swipeHandlersRest } = swipeHandlers

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      ;(scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      if (typeof swipeRef === "function") {
        swipeRef(node)
      }
    },
    [swipeRef]
  )

  useEffect(() => {
    const pageEl = pageRef.current
    if (!pageEl || pageHighlights.length === 0) return

    let observer: MutationObserver | null = null
    let attempts = 0
    const maxAttempts = 20

    const boldHighlights = () => {
      const textSpans = pageEl.querySelectorAll<HTMLElement>(
        ".react-pdf__Page__textContent span"
      )
      if (textSpans.length === 0) return

      const highlightEls = pageEl.querySelectorAll<HTMLElement>(
        "[data-highlight-id]"
      )

      highlightEls.forEach((hlEl) => {
        const hlBounds = hlEl.getBoundingClientRect()
        textSpans.forEach((span) => {
          const spanBounds = span.getBoundingClientRect()
          const overlap = !(
            spanBounds.right < hlBounds.left ||
            spanBounds.left > hlBounds.right ||
            spanBounds.bottom < hlBounds.top ||
            spanBounds.top > hlBounds.bottom
          )
          if (overlap) {
            span.style.fontWeight = "bold"
          }
        })
      })

      observer?.disconnect()
    }

    const tryBold = () => {
      if (pageEl.querySelector(".react-pdf__Page__textContent")) {
        boldHighlights()
      } else if (attempts < maxAttempts) {
        attempts++
        setTimeout(tryBold, 150)
      }
    }

    observer = new MutationObserver(() => {
      tryBold()
    })
    observer.observe(pageEl, { childList: true, subtree: true })
    tryBold()

    return () => {
      observer?.disconnect()
    }
  }, [pageNumber, pageHighlights, scale])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-b px-4 py-2">
        <span className="hidden sm:contents">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goTo(pageNumber - 1)}
          disabled={pageNumber <= 1}
        >
          <ChevronLeft />
          Anterior
        </Button>
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">
          Página {pageNumber} de {numPages ?? "—"}
        </span>
        <span className="hidden sm:contents">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goTo(pageNumber + 1)}
          disabled={numPages !== null && pageNumber >= numPages}
        >
          Siguiente
          <ChevronRight />
        </Button>
        </span>
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
        ref={isMobile ? mergedRef : scrollRef}
        className="flex min-h-0 flex-1 flex-col items-center overflow-auto bg-muted/40 p-4"
        {...(isMobile ? swipeHandlersRest : {})}
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
            <div
              ref={pageRef}
              className="pdf-page relative"
              onMouseUp={handleMouseUp}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={true}
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
              {pageHighlights.map((h) =>
                h.pdfRects?.map((rect, i) => (
                  <div
                    key={`${h.id}-${i}`}
                    data-highlight-id={h.id}
                    data-highlight-color={h.color}
                    className="pointer-events-auto absolute cursor-pointer transition-opacity hover:opacity-80"
                    style={{
                      left: rect.x,
                      top: rect.y,
                      width: rect.width,
                      height: rect.height,
                      backgroundColor: getEffectiveHighlightColor(h.color, mode),
                      mixBlendMode: "multiply",
                    }}
                    title={h.text}
                    onClick={() => onDeleteHighlight(h.id)}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-20 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
              <span>Calculando vista…</span>
            </div>
          )}
        </Document>
      </div>

      {popover && (
        <HighlightPopover
          x={popover.x}
          y={popover.y}
          onSelect={handleColorSelect}
          onClose={() => {
            setPopover(null)
            setSelectionText("")
            window.getSelection()?.removeAllRanges()
          }}
        />
      )}
    </div>
  )
}
