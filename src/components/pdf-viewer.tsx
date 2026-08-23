"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import type { PDFDocumentProxy } from "pdfjs-dist"
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

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2]

const CONTINUOUS_GAP = 24

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
}

export function PdfViewer({
  url,
  initialPage = 1,
  onPageChange,
  onTotalPagesChange,
  bookId,
  highlights,
  onCreateHighlight,
  onReady,
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
  const [scrollSize, setScrollSize] = useState({ width: 0, height: 0 })

  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[] | null>(null)
  const [renderedRange, setRenderedRange] = useState<{ start: number; end: number } | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const pendingCenterRef = useRef(true)

  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null)
  const [selectionText, setSelectionText] = useState<string>("")

  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const settings = loadViewerSettings()
    settings.pdfZoomMode = zoomMode
    settings.pdfZoom = zoom
    saveViewerSettings(settings)
  }, [zoomMode, zoom])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageSizes(null)
    setRenderedRange(null)
    setLoadError(null)
    setViewport(null)
    setNumPages(null)
    pdfRef.current = null
  }, [url])

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

  const onDocumentLoadSuccess = useCallback(
    (pdf: PDFDocumentProxy) => {
      setNumPages(pdf.numPages)
      pdfRef.current = pdf
      setPageNumber((prev) => {
        const clamped = Math.min(Math.max(1, prev), pdf.numPages)
        pageNumberRef.current = clamped
        return clamped
      })
      onTotalPagesChange?.(pdf.numPages)
    },
    [onTotalPagesChange]
  )

  const onLoadError = useCallback((error: Error) => {
    const name = error instanceof Error ? error.name : ""
    const message = error instanceof Error ? error.message : String(error)
    let label = "No se pudo abrir el PDF."
    if (name === "PasswordException") {
      label = "El PDF está protegido con contraseña."
    } else if (name === "InvalidPDFException") {
      label = "El archivo no es un PDF válido."
    } else if (/fetch|network|Failed to fetch/i.test(message)) {
      label = "Error de red al descargar el PDF."
    }
    setLoadError(message ? `${label} (${message})` : label)
  }, [])

  useEffect(() => {
    const pdf = pdfRef.current
    if (!pdf || numPages === null || pageSizes) return
    let cancelled = false
    const load = async () => {
      const pages = await Promise.all(
        Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1))
      )
      if (cancelled) return
      setPageSizes(
        pages.map((p) => {
          const vp = p.getViewport({ scale: 1 })
          return { width: vp.width, height: vp.height }
        })
      )
    }
    void load().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [url, numPages, pageSizes])

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
    if (zoomMode === "fit-width" || zoomMode === "fit-page") {
      const refWidth = pageSizes?.[0] ? pageSizes[0].width : viewport.width
      return cw / refWidth
    }
    return zoom
  }, [viewport, zoomMode, zoom, scrollSize, pageSizes])

  const scaledSizes = useMemo(() => {
    if (!pageSizes || !scale) return null
    return pageSizes.map((s) => ({
      width: s.width * scale,
      height: s.height * scale,
    }))
  }, [pageSizes, scale])

  const offsets = useMemo(() => {
    if (!scaledSizes) return null
    const arr: number[] = []
    let acc = 0
    for (const s of scaledSizes) {
      arr.push(acc)
      acc += s.height + CONTINUOUS_GAP
    }
    return arr
  }, [scaledSizes])

  const totalHeight = useMemo(() => {
    if (!offsets || !scaledSizes || scaledSizes.length === 0) return 0
    return (
      offsets[offsets.length - 1] +
      scaledSizes[scaledSizes.length - 1].height
    )
  }, [offsets, scaledSizes])

  const goTo = useCallback(
    (page: number) => {
      const next = Math.min(Math.max(1, page), numPages ?? 1)
      const el = scrollRef.current
      if (offsets) {
        const idx = next - 1
        if (idx >= 0 && idx < offsets.length) {
          el?.scrollTo(0, offsets[idx])
        }
      } else {
        el?.scrollTo(0, 0)
      }
      if (next === pageNumberRef.current) return
      pageNumberRef.current = next
      setPageNumber(next)
      onPageChange?.(next)
    },
    [numPages, onPageChange, offsets]
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

  const updateContinuousView = useCallback(() => {
    const el = scrollRef.current
    if (!el || !offsets || !scaledSizes) return
    const n = offsets.length
    if (n === 0) return
    const viewTop = el.scrollTop
    const viewBottom = viewTop + el.clientHeight
    let start = 0
    let end = 0
    let found = false
    for (let i = 0; i < n; i++) {
      const bottom = offsets[i] + scaledSizes[i].height
      if (!found && bottom > viewTop) {
        start = i
        found = true
      }
      if (bottom > viewTop) end = i
      if (offsets[i] > viewBottom) break
    }
    const buffer = 1
    const s = Math.max(0, start - buffer)
    const e = Math.min(n - 1, end + buffer)
    setRenderedRange((prev) =>
      prev && prev.start === s && prev.end === e ? prev : { start: s, end: e }
    )

    let current = 1
    for (let i = 0; i < n; i++) {
      if (offsets[i] <= viewTop + 2) current = i + 1
      else break
    }
    if (current !== pageNumberRef.current) {
      pageNumberRef.current = current
      setPageNumber(current)
      onPageChange?.(current)
    }
  }, [offsets, scaledSizes, onPageChange])

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null
      updateContinuousView()
    })
  }, [updateContinuousView])

  useEffect(() => {
    pendingCenterRef.current = true
  }, [zoomMode, zoom])

  useEffect(() => {
    if (!offsets || offsets.length === 0) return
    if (!pendingCenterRef.current) return
    pendingCenterRef.current = false
    const el = scrollRef.current
    if (!el) return
    const idx = Math.min(Math.max(1, pageNumberRef.current), offsets.length) - 1
    el.scrollTo(0, offsets[idx])
  }, [offsets])

  useEffect(() => {
    updateContinuousView()
  }, [offsets, updateContinuousView])

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target
      if (target instanceof Element && target.closest("input, select, textarea, [contenteditable]")) return

      if (e.key === "Home") {
        e.preventDefault()
        goTo(1)
      } else if (e.key === "End") {
        e.preventDefault()
        goTo(numPagesRef.current ?? 1)
      }

      if (e.key === "+" || e.key === "=") {
        const cur = zoomMode === "custom" ? zoom : 1
        const next = ZOOM_STEPS.find((s) => s > cur + 0.001) ?? 2
        setZoom(next)
        setZoomMode("custom")
      } else if (e.key === "-") {
        const cur = zoomMode === "custom" ? zoom : 1
        const next = [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.001) ?? 0.5
        setZoom(next)
        setZoomMode("custom")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [goTo, zoomMode, zoom])

  const findPageElement = useCallback((node: Node | null): HTMLElement | null => {
    if (!node) return null
    const el = node instanceof Element ? node : node.parentElement
    return el?.closest<HTMLElement>("[data-page-index]") ?? null
  }, [])

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        return
      }

      const pageEl = findPageElement(selection.anchorNode)
      if (!pageEl) return

      const text = selection.toString().trim()
      if (!text) return

      const range = selection.getRangeAt(0)
      const rects = range.getClientRects()
      if (rects.length === 0) return

      const firstRect = rects[0]
      setPopover({
        x: firstRect.left + firstRect.width / 2,
        y: firstRect.top,
      })
      setSelectionText(text)
    }, 0)
  }, [findPageElement])

  const handleColorSelect = useCallback(
    (color: HighlightColor) => {
      const selection = window.getSelection()
      if (!selection || !selectionText) {
        setPopover(null)
        return
      }

      const pageEl = findPageElement(selection.anchorNode)
      if (!pageEl) {
        setPopover(null)
        return
      }

      const page = Number(pageEl.dataset.pageIndex)
      if (!page) {
        setPopover(null)
        return
      }

      const range = selection.getRangeAt(0)
      const rects = range.getClientRects()
      if (rects.length === 0) {
        setPopover(null)
        return
      }

      const pageRect = pageEl.getBoundingClientRect()
      const s = scale ?? 1

      const pdfRects: HighlightRect[] = Array.from(rects).map((r) => ({
        x: (r.left - pageRect.left) / s,
        y: (r.top - pageRect.top) / s,
        width: r.width / s,
        height: r.height / s,
      }))

      import("@/app/actions/highlights").then(({ createHighlight: create }) => {
        create({
          bookId,
          text: selectionText,
          color,
          pdfPage: page,
          pdfRects,
          pageLabel: page ? `Página ${page}` : undefined,
        }).then((result) => {
          if (result.success && result.highlight) {
            onCreateHighlight({
              id: result.highlight.id,
              text: selectionText,
              color,
              pdfRects,
              pdfPage: page,
              pageLabel: result.highlight.pageLabel ?? null,
            })
          }
        })
      })

      selection.removeAllRanges()
      setPopover(null)
      setSelectionText("")
    },
    [bookId, selectionText, scale, onCreateHighlight, findPageElement]
  )

  useEffect(() => {
    const container = scrollRef.current
    if (!container || highlights.length === 0) return

    let observer: MutationObserver | null = null
    let attempts = 0
    const maxAttempts = 20

    const boldHighlights = () => {
      const highlightEls = container.querySelectorAll<HTMLElement>(
        "[data-highlight-id]"
      )
      if (highlightEls.length === 0) return

      const byPage = new Map<HTMLElement, HTMLElement[]>()
      highlightEls.forEach((hlEl) => {
        const wrapper = hlEl.closest<HTMLElement>("[data-page-index]")
        if (!wrapper) return
        const list = byPage.get(wrapper) ?? []
        list.push(hlEl)
        byPage.set(wrapper, list)
      })

      byPage.forEach((els, wrapper) => {
        const textSpans = wrapper.querySelectorAll<HTMLElement>(
          ".react-pdf__Page__textContent span"
        )
        if (textSpans.length === 0) return
        els.forEach((hlEl) => {
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
      })
    }

    const tryBold = () => {
      if (container.querySelector(".react-pdf__Page__textContent")) {
        boldHighlights()
      } else if (attempts < maxAttempts) {
        attempts++
        setTimeout(tryBold, 150)
      }
    }

    observer = new MutationObserver(() => {
      tryBold()
    })
    observer.observe(container, { childList: true, subtree: true })
    tryBold()

    return () => {
      observer?.disconnect()
    }
  }, [highlights, scale])

  const renderHighlightOverlays = (h: PdfHighlight, scaleValue: number) =>
    h.pdfRects?.map((rect, i) => (
      <div
        key={`${h.id}-${i}`}
        data-highlight-id={h.id}
        data-highlight-color={h.color}
        className="pointer-events-none absolute"
        style={{
          left: rect.x * scaleValue,
          top: rect.y * scaleValue,
          width: rect.width * scaleValue,
          height: rect.height * scaleValue,
          backgroundColor: getEffectiveHighlightColor(h.color, mode),
          mixBlendMode: "multiply",
        }}
      />
    ))

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
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseUp={handleMouseUp}
        className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4"
      >
        <Document
          key={retryKey}
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onLoadError}
          loading={
            <div className="flex items-center gap-2 py-20 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
              <span>Cargando PDF…</span>
            </div>
          }
          error={
            <div className="py-20 text-center">
              <p className="text-destructive">
                {loadError ?? "Error al cargar el PDF"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setLoadError(null)
                  setRetryKey((k) => k + 1)
                }}
              >
                Reintentar
              </Button>
            </div>
          }
        >
          {!scale || !offsets || !scaledSizes ? (
            <div className="flex items-center gap-2 py-20 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
              <span>Calculando vista…</span>
            </div>
          ) : (
            <div
              className="pdf-continuous relative w-full"
              style={{ height: totalHeight }}
            >
              {scaledSizes.map((size, i) => {
                const page = i + 1
                const isRendered =
                  renderedRange !== null &&
                  page >= renderedRange.start + 1 &&
                  page <= renderedRange.end + 1
                const pageHighlights = highlights.filter(
                  (h) => h.pdfPage === page
                )
                return (
                  <div
                    key={page}
                    data-page-index={page}
                    className="pdf-page absolute left-0 w-full"
                    style={{ top: offsets[i], height: size.height }}
                  >
                    <div
                      className="relative mx-auto"
                      style={{ width: size.width, height: size.height }}
                    >
                      {isRendered ? (
                        <>
                          <Page
                            pageNumber={page}
                            scale={scale}
                            renderTextLayer={true}
                            renderAnnotationLayer={false}
                            loading={
                              <div className="flex items-center justify-center py-10 text-muted-foreground">
                                <LoaderCircle className="size-5 animate-spin" />
                              </div>
                            }
                            error={
                              <div className="py-10 text-center text-destructive">
                                Error al renderizar la página
                              </div>
                            }
                          />
                          {pageHighlights.map((h) =>
                            renderHighlightOverlays(h, scale)
                          )}
                        </>
                      ) : null}
                    </div>
                  </div>
                )
              })}
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
