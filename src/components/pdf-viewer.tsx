"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { Button } from "@/components/ui/button"
import { LoaderCircle, PanelLeft } from "lucide-react"
import {
  usePdfViewerSettings,
  getEffectiveHighlightColor,
  parsePdfPage,
  type PdfZoomMode,
  type HighlightColor,
} from "@/lib/viewer-settings"
import { PdfThumbnails } from "@/components/pdf-thumbnails"
import { HighlightPopover } from "@/components/highlight-popover"
import { useThemeMode } from "@/components/theme-provider"
import { ReaderHeader } from "@/components/reader-header"
import { HighlightSidebar } from "@/components/highlight-sidebar"
import { ReturnButton } from "@/components/return-button"
import { saveProgress } from "@/app/actions/progress"
import {
  createHighlight,
  deleteHighlight,
  getBookHighlights,
} from "@/app/actions/highlights"
import type { Highlight as PrismaHighlight } from "@/generated/prisma/client"
import type { ReaderHighlight } from "@/lib/reader-types"

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

/** @pdf-highlight Resaltado interno del visor PDF: guarda los rects para
 *  pintar los overlays y la página. Para la barra lateral compartida se mapea
 *  a ReaderHighlight con location = "page:N".
 *  @keyword tipo, resaltado-pdf, rects, pagina */
type PdfHighlight = {
  id: string
  text: string
  color: HighlightColor
  pdfRects: HighlightRect[] | null
  pdfPage: number | null
  pageLabel: string | null
}

/** @pdf-viewer-props Props del visor PDF.
 *  Es autocontenido: maneja su header, navegación, progreso, resaltados y
 *  barra lateral. No recibe estado del shell.
 *  @keyword props, url, titulo, libro, ubicacion-inicial */
export type PdfViewerProps = {
  url: string
  title: string
  bookId: string
  initialLocation: string | null
}

/** @pdf-viewer Visor de libros PDF (react-pdf/pdfjs).
 *  Componente autocontenido: render continuo, zoom, resaltados con rects,
 *  persistencia de progreso (page:N) y barra lateral. No comparte estado
 *  con el visor EPUB.
 *  @keyword lector, visor-PDF, pdfjs, resaltado, progreso, zoom,
 *  navegacion, barra-lateral, Server-Action */
export function PdfViewer({
  url,
  title,
  bookId,
  initialLocation,
}: PdfViewerProps) {
  const { mode } = useThemeMode()
  const { zoomMode, setZoomMode, zoom, setZoom } = usePdfViewerSettings()

  // ──────────────────────────────────────────────
  //  @estado-paginas Página actual y total del documento
  //  @keyword pagina-actual, total-paginas, numPages
  // ──────────────────────────────────────────────
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(() =>
    Math.max(1, parsePdfPage(initialLocation) ?? 1)
  )
  const pageNumberRef = useRef(pageNumber)
  const numPagesRef = useRef<number | null>(null)

  useEffect(() => {
    pageNumberRef.current = pageNumber
  }, [pageNumber])

  useEffect(() => {
    numPagesRef.current = numPages
  }, [numPages])

  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollSize, setScrollSize] = useState({ width: 0, height: 0 })

  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[] | null>(null)
  const [renderedRange, setRenderedRange] = useState<{ start: number; end: number } | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const pendingCenterRef = useRef(true)

  // ──────────────────────────────────────────────
  //  @estado-resaltados Selección de texto, popover, resaltados y sidebar
  //  @keyword resaltado, seleccion-texto, popover, rects, anotacion, sidebar
  // ──────────────────────────────────────────────
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null)
  const [selectionText, setSelectionText] = useState<string>("")
  const [highlights, setHighlights] = useState<PdfHighlight[]>([])
  const [highlightsLoaded, setHighlightsLoaded] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false)

  // ──────────────────────────────────────────────
  //  @estado-retorno Target para botón "Volver a la página anterior"
  //  @keyword retorno, volver, navegar-resaltado, bookmark-temporal
  // ──────────────────────────────────────────────
  const [returnTarget, setReturnTarget] = useState<{
    pdfPage?: number
  } | null>(null)

  // ──────────────────────────────────────────────
  //  @refs Referencias de progreso y navegación a resaltados
  //  @keyword referencia, ref, progreso, navegacion-resaltado
  // ──────────────────────────────────────────────
  const navigatingToHighlightRef = useRef(false)
  const lastLocationRef = useRef<string | null>(initialLocation)
  const pdfSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

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
    // numPages: el contenedor de scroll se monta recién cuando el
    // <Document> termina de cargar (numPages pasa de null a un número);
    // con deps vacías el observer nunca se adjuntaba y el zoom quedaba en 0.
  }, [numPages])

  // ──────────────────────────────────────────────
  //  @persistencia-ubicacion Guarda la última ubicación pendiente al
  //  desmontar el componente (el progreso se guarda con debounce).
  //  @keyword persistencia, progreso, cleanup, desmontaje, saveProgress
  // ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pdfSaveTimerRef.current) {
        clearTimeout(pdfSaveTimerRef.current)
      }
      const last = lastLocationRef.current
      if (last) {
        void saveProgress(bookId, last)
      }
    }
  }, [bookId])

  // ──────────────────────────────────────────────
  //  @carga-resaltados Carga los resaltados de este libro desde la DB.
  //  Solo considera los que NO tienen CFI (formato PDF).
  //  @keyword carga-inicial, base-de-datos, Prisma, Server-Action,
  //  getBookHighlights, pdfPage, separar-formato
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (highlightsLoaded) return
    getBookHighlights(bookId).then((items) => {
      const pdfItems: PdfHighlight[] = []
      for (const h of items as PrismaHighlight[]) {
        if (!h.cfi) {
          pdfItems.push({
            id: h.id,
            text: h.text,
            color: h.color as HighlightColor,
            pdfRects: h.pdfRects as PdfHighlight["pdfRects"],
            pdfPage: h.pdfPage,
            pageLabel: h.pageLabel ?? null,
          })
        }
      }
      setHighlights(pdfItems)
      setHighlightsLoaded(true)
    })
  }, [bookId, highlightsLoaded])

  // ──────────────────────────────────────────────
  //  @progreso-pagina Guarda el progreso con debounce en cada cambio de
  //  página. Si la navegación fue disparada por un click en resaltado,
  //  resetea la bandera y conserva el returnTarget.
  //  @keyword progreso, pagina, debounce, saveProgress, returnTarget
  // ──────────────────────────────────────────────
  const handlePageChange = useCallback(
    (page: number) => {
      lastLocationRef.current = `page:${page}`
      if (pdfSaveTimerRef.current) {
        clearTimeout(pdfSaveTimerRef.current)
      }
      pdfSaveTimerRef.current = setTimeout(() => {
        void saveProgress(bookId, `page:${page}`)
      }, 1200)
      if (navigatingToHighlightRef.current) {
        navigatingToHighlightRef.current = false
        return
      }
      if (returnTarget) {
        setReturnTarget(null)
      }
    },
    [bookId, returnTarget]
  )

  const onDocumentLoadSuccess = useCallback(
    (pdf: PDFDocumentProxy) => {
      setNumPages(pdf.numPages)
      pdfRef.current = pdf
      setPageNumber((prev) => {
        const clamped = Math.min(Math.max(1, prev), pdf.numPages)
        pageNumberRef.current = clamped
        return clamped
      })
    },
    []
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

  // ──────────────────────────────────────────────
  //  @ir-a-pagina Navega a un número de página (PageNav, keyboard, sidebar).
  //  @keyword goTo, ir-a-pagina, scroll, PageNav
  // ──────────────────────────────────────────────
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
      handlePageChange(next)
    },
    [numPages, handlePageChange, offsets]
  )

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
      handlePageChange(current)
    }
  }, [offsets, scaledSizes, handlePageChange])

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
    [setZoomMode, setZoom]
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
  }, [goTo, zoomMode, zoom, setZoomMode, setZoom])

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

      const originEl =
        pageEl.querySelector<HTMLElement>(".react-pdf__Page") ?? pageEl
      const pageRect = originEl.getBoundingClientRect()
      const s = scale ?? 1

      const pdfRects: HighlightRect[] = Array.from(rects).map((r) => ({
        x: (r.left - pageRect.left) / s,
        y: (r.top - pageRect.top) / s,
        width: r.width / s,
        height: r.height / s,
      }))

      createHighlight({
        bookId,
        text: selectionText,
        color,
        pdfPage: page,
        pdfRects,
        pageLabel: page ? `Página ${page}` : undefined,
      }).then((result) => {
        if (result.success && result.highlight) {
          setHighlights((prev) => [
            ...prev,
            {
              id: result.highlight.id,
              text: selectionText,
              color,
              pdfRects,
              pdfPage: page,
              pageLabel: result.highlight.pageLabel ?? null,
            },
          ])
        }
      })

      selection.removeAllRanges()
      setPopover(null)
      setSelectionText("")
    },
    [bookId, selectionText, scale, findPageElement]
  )

  // ──────────────────────────────────────────────
  //  @sidebar-items Mapea los resaltados internos a ReaderHighlight para la
  //  barra lateral compartida. location = "page:N".
  //  @keyword sidebar, mapeo, ReaderHighlight, location
  // ──────────────────────────────────────────────
  const sidebarHighlights = useMemo<ReaderHighlight[]>(
    () =>
      highlights.map((h) => ({
        id: h.id,
        text: h.text,
        color: h.color,
        pageLabel: h.pageLabel,
        location: h.pdfPage != null ? `page:${h.pdfPage}` : "",
      })),
    [highlights]
  )

  /** @eliminar-resaltado Elimina un resaltado de la DB (Server Action
   *  deleteHighlight) y lo remueve del estado local.
   *  @keyword eliminar-resaltado, deleteHighlight, Server-Action, PDF */
  const handleDeleteHighlight = useCallback((h: ReaderHighlight) => {
    deleteHighlight(h.id).then((result) => {
      if (result.success) {
        setHighlights((prev) => prev.filter((x) => x.id !== h.id))
      }
    })
  }, [])

  /** @navegar-resaltado-pdf Navega a un resaltado por su página.
   *  Guarda la página actual como returnTarget. Cierra la barra lateral.
   *  @keyword PDF, navegar-resaltado, goToPage, pagina, returnTarget */
  const navigateToHighlight = useCallback(
    (h: ReaderHighlight) => {
      const match = /^page:(\d+)$/.exec(h.location)
      if (!match) return
      const page = Number(match[1])
      const currentPage = pageNumberRef.current
      setReturnTarget({ pdfPage: currentPage })
      navigatingToHighlightRef.current = true
      goTo(page)
      setSidebarOpen(false)
    },
    [goTo]
  )

  /** @volver-posicion-anterior Retorna a la página guardada en returnTarget
   *  (la página desde donde el usuario navegó a un resaltado).
   *  @keyword volver, retorno, pagina-anterior, bookmark, Undo2 */
  const handleReturn = useCallback(() => {
    if (!returnTarget) return
    if (returnTarget.pdfPage !== undefined) {
      goTo(returnTarget.pdfPage)
    }
    setReturnTarget(null)
  }, [returnTarget, goTo])

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

  // ──────────────────────────────────────────────
  //  @render Renderizado del componente.
  //  @keyword render, JSX, layout, header, main, sidebar, popover
  // ──────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <ReaderHeader
        title={title}
        currentPage={pageNumber}
        totalPages={numPages}
        onNavigate={goTo}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      >
        {/** @toggle-miniaturas Botón para abrir el panel de miniaturas en
         *  pantallas chicas (en desktop el panel es siempre visible).
         *  @keyword miniaturas, toggle, mobile, overlay */}
        <Button
          variant="outline"
          size="sm"
          className="sm:hidden"
          onClick={() => setThumbnailsOpen((v) => !v)}
          aria-label="Miniaturas"
        >
          <PanelLeft className="size-4" />
        </Button>

        {/** @control-zoom Selector de zoom exclusivo del PDF.
         *  @keyword zoom, ajustar-ancho, ajustar-pagina, porcentaje */}
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
      </ReaderHeader>

      <div className="flex min-h-0 flex-1">
        {/**
         * @document-pdf El <Document> envuelve el área completa (miniaturas +
         *  visor) para que ambos compartan la misma instancia pdfjs y el
         *  archivo se descargue una sola vez. Loading/error reemplazan todo
         *  hasta que el documento está listo.
         *  @keyword Document, pdfjs, instancia-compartida, loading, error */}
        <Document
          key={retryKey}
          file={url}
          className="min-h-0 flex-1"
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
<div className="flex h-full w-full min-h-0">
            {/**
             * @panel-miniaturas Vista previa del PDF (estilo Adobe): miniaturas
             *  con scroll interno, página en lectura marcada por defecto y
             *  click para navegar. Siempre visible en desktop; overlay en mobile.
             *  @keyword miniaturas, vista-previa, panel, Adobe, pagina-activa */}
            {pageSizes && (
              <PdfThumbnails
                open={thumbnailsOpen}
                onClose={() => setThumbnailsOpen(false)}
                pageSizes={pageSizes}
                currentPage={pageNumber}
                onNavigate={(page) => {
                  goTo(page)
                  setThumbnailsOpen(false)
                }}
              />
            )}
            <main className="relative flex min-h-0 flex-1 flex-col">
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                onMouseUp={handleMouseUp}
                className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4"
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
              </div>

              {/**
               * @boton-retorno Botón flotante "Volver a la página anterior".
               *  Visible solo cuando returnTarget no es null (el usuario navegó
               *  a un resaltado desde otra página).
               *  @keyword boton-retorno, volver, pagina-anterior, Undo2, flotante */}
              <ReturnButton
                visible={!!returnTarget}
                onReturn={handleReturn}
              />
            </main>
          </div>
        </Document>

        {/**
         * @barra-lateral-resaltados Barra lateral con la lista de resaltados.
         *  @keyword sidebar, barra-lateral, resaltados, lista, navegar,
         *  eliminar, color, pagina */}
        <HighlightSidebar
          open={sidebarOpen}
          highlights={sidebarHighlights}
          onClose={() => setSidebarOpen(false)}
          onNavigate={navigateToHighlight}
          onDelete={handleDeleteHighlight}
        />
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