"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import type { Rendition } from "epubjs"
import { ReactReader, ReactReaderStyle } from "react-reader"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { useThemeMode } from "@/components/theme-provider"
import { HighlightPopover } from "@/components/highlight-popover"
import { saveProgress } from "@/app/actions/progress"
import {
  createHighlight,
  deleteHighlight,
  getBookHighlights,
} from "@/app/actions/highlights"
import type { Highlight as PrismaHighlight } from "@/generated/prisma/client"
import {
  loadViewerSettings,
  saveViewerSettings,
  parsePdfPage,
  HIGHLIGHT_COLORS,
  getEffectiveHighlightColor,
  type ReaderMode,
  type HighlightColor,
} from "@/lib/viewer-settings"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  LoaderCircle,
  Minus,
  Plus,
  Trash2,
  Undo2,
  X,
} from "lucide-react"
import type { PdfHighlight, PdfViewerApi } from "@/components/pdf-viewer"

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

type ReaderWrapperProps = {
  url: string
  format: string
  title: string
  bookId: string
  initialLocation: string | null
}

const EPUB_THEMES: Record<
  ReaderMode,
  { body: string; background: string }
> = {
  light: { body: "#1a1a1a", background: "#ffffff" },
  dark: { body: "#e5e5e5", background: "#111318" },
  sepia: { body: "#5b4636", background: "#f4ecd8" },
}

const FLOW_CONSTRAINTS = {
  body: { "overflow-x": "hidden" },
  "*": { "max-width": "100%" },
  img: { "max-width": "100%", height: "auto" },
  svg: { "max-width": "100%", height: "auto" },
  table: { "max-width": "100%" },
  pre: { "max-width": "100%", "white-space": "pre-wrap", "overflow-wrap": "break-word" },
  "div, p, h1, h2, h3, h4, h5, h6": { "max-width": "100%", "overflow-wrap": "break-word" },
}

const READER_BACKGROUNDS: Record<ReaderMode, string> = {
  light: "#ffffff",
  dark: "#111318",
  sepia: "#f4ecd8",
}

const TOC_THEMES: Record<
  ReaderMode,
  {
    tocArea: { background: string }
    tocAreaButton: { color: string; borderBottom: string }
    tocButtonExpanded: { background: string }
    tocButtonBar: { background: string }
  }
> = {
  light: {
    tocArea: { background: "#f7f7f7" },
    tocAreaButton: { color: "#555", borderBottom: "1px solid #e0e0e0" },
    tocButtonExpanded: { background: "#f7f7f7" },
    tocButtonBar: { background: "#888" },
  },
  dark: {
    tocArea: { background: "#1a1f2b" },
    tocAreaButton: { color: "#bbb", borderBottom: "1px solid #2a2e38" },
    tocButtonExpanded: { background: "#1a1f2b" },
    tocButtonBar: { background: "#999" },
  },
  sepia: {
    tocArea: { background: "#efe0c8" },
    tocAreaButton: { color: "#5b4636", borderBottom: "1px solid #d8c8a8" },
    tocButtonExpanded: { background: "#efe0c8" },
    tocButtonBar: { background: "#9a8570" },
  },
}

type EpubHighlight = {
  id: string
  text: string
  color: HighlightColor
  cfi: string | null
  pageLabel: string | null
}

export function ReaderWrapper({
  url,
  format,
  title,
  bookId,
  initialLocation,
}: ReaderWrapperProps) {
  const [mounted, setMounted] = useState(false)
  const { mode } = useThemeMode()
  const modeRef = useRef(mode)

  useEffect(() => {
    // eslint-disable-next-line
    setMounted(true)
  }, [])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const [settings, setSettings] = useState(() => loadViewerSettings())
  const [location, setLocation] = useState<string | null>(initialLocation)
  const renditionRef = useRef<Rendition | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLocationRef = useRef<string | null>(initialLocation)
  const [renditionReady, setRenditionReady] = useState(false)

  const [epubTotalPages, setEpubTotalPages] = useState<number | null>(null)
  const [epubCurrentPage, setEpubCurrentPage] = useState<number>(1)
  const epubCurrentPageRef = useRef<number>(1)
  const locationsReadyRef = useRef(false)

  const [pdfCurrentPage, setPdfCurrentPage] = useState<number>(1)
  const [pdfTotalPages, setPdfTotalPages] = useState<number | null>(null)

  const [pageInput, setPageInput] = useState("1")
  const [isEditingPage, setIsEditingPage] = useState(false)

  const isEpub = format.toLowerCase() === "epub"
  const isPdf = format.toLowerCase() === "pdf"

  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null)
  const [selectionCfi, setSelectionCfi] = useState<string>("")
  const [selectionText, setSelectionText] = useState<string>("")
  const [epubHighlights, setEpubHighlights] = useState<EpubHighlight[]>([])
  const [pdfHighlights, setPdfHighlights] = useState<PdfHighlight[]>([])
  const [highlightsLoaded, setHighlightsLoaded] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [returnTarget, setReturnTarget] = useState<{
    epubLocation?: string
    pdfPage?: number
  } | null>(null)

  const pdfApiRef = useRef<PdfViewerApi | null>(null)
  const locationRef = useRef(location)
  const navigatingToHighlightRef = useRef(false)
  const epubHighlightsRef = useRef<EpubHighlight[]>([])

  useEffect(() => {
    locationRef.current = location
  }, [location])

  useEffect(() => {
    epubHighlightsRef.current = epubHighlights
  }, [epubHighlights])

  const proxiedUrl = `/api/file?url=${encodeURIComponent(url)}`

  const persistLocation = useCallback(
    (loc: string) => {
      lastLocationRef.current = loc
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      saveTimerRef.current = setTimeout(() => {
        void saveProgress(bookId, loc)
      }, 1200)
    },
    [bookId]
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      const last = lastLocationRef.current
      if (last) {
        void saveProgress(bookId, last)
      }
    }
  }, [bookId])

  useEffect(() => {
    saveViewerSettings(settings)
  }, [settings])

  const handlePdfReady = useCallback((api: PdfViewerApi) => {
    pdfApiRef.current = api
  }, [])

  const applyHighlightsToRendition = useCallback(
    (rendition: Rendition, items: EpubHighlight[]) => {
      items.forEach((h) => {
        if (h.cfi) {
          rendition.annotations.highlight(
            h.cfi,
            { color: h.color },
            () => {
              try {
                const range = rendition.getRange(h.cfi!)
                if (range && !range.collapsed) {
                  const doc = range.commonAncestorContainer.ownerDocument
                  if (doc) {
                    const strong = doc.createElement("span")
                    strong.style.fontWeight = "bold"
                    range.surroundContents(strong)
                  }
                }
              } catch {
                // bold wrapping failed silently
              }
            },
            "highlight-" + h.id,
            {
              fill: getEffectiveHighlightColor(h.color, modeRef.current),
              "fill-opacity": "1",
              "mix-blend-mode": "multiply",
            }
          )
        }
      })
    },
    []
  )

  const refreshAllAnnotations = useCallback(() => {
    const rendition = renditionRef.current
    if (!rendition) return
    const items = epubHighlightsRef.current

    items.forEach((h) => {
      try {
        rendition.annotations.remove("highlight-" + h.id, "highlight")
      } catch {
        // highlight may not exist yet
      }
    })

    const contents = rendition.getContents() as unknown as { document?: Document; window?: { document?: Document } }[]
    contents.forEach((content) => {
      const doc = content.document ?? content.window?.document
      if (!doc) return
      const layer = doc.querySelector(".epubjs-annotation-layer")
      if (layer) layer.innerHTML = ""
    })

    applyHighlightsToRendition(rendition, items)
  }, [applyHighlightsToRendition])

  useEffect(() => {
    if (highlightsLoaded) return
    getBookHighlights(bookId).then((items) => {
      const epubItems: EpubHighlight[] = []
      const pdfItems: PdfHighlight[] = []

      for (const h of items as PrismaHighlight[]) {
        if (h.cfi) {
          epubItems.push({
            id: h.id,
            text: h.text,
            color: h.color as HighlightColor,
            cfi: h.cfi,
            pageLabel: h.pageLabel ?? null,
          })
        } else {
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

      setEpubHighlights(epubItems)
      setPdfHighlights(pdfItems)
      setHighlightsLoaded(true)

      epubHighlightsRef.current = epubItems

      const rendition = renditionRef.current
      if (rendition) {
        applyHighlightsToRendition(rendition, epubItems)
      }
    })
  }, [bookId, highlightsLoaded, applyHighlightsToRendition])

  useEffect(() => {
    if (!renditionReady || !highlightsLoaded) return
    const rendition = renditionRef.current
    if (!rendition) return
    applyHighlightsToRendition(rendition, epubHighlightsRef.current)
  }, [renditionReady, highlightsLoaded, applyHighlightsToRendition])

  const locationChanged = useCallback(
    (loc: string) => {
      setLocation(loc)
      persistLocation(loc)
      if (navigatingToHighlightRef.current) {
        navigatingToHighlightRef.current = false
        return
      }
      if (returnTarget) {
        setReturnTarget(null)
      }
      const rendition = renditionRef.current
      if (
        rendition &&
        rendition.book?.locations &&
        locationsReadyRef.current
      ) {
        const page = Number(rendition.book.locations.locationFromCfi(loc))
        if (page > 0) {
          setEpubCurrentPage(page)
          epubCurrentPageRef.current = page
        }
      }
    },
    [persistLocation, returnTarget]
  )

  const getRendition = useCallback((rendition: Rendition) => {
    renditionRef.current = rendition
    setRenditionReady(true)

    // epub.js bug: Locations._locations is undefined until generate() completes,
    // but Rendition calls locationFromCfi/percentageFromCfi internally during
    // page navigation. Pre-init as empty array so internal calls don't crash.
    try {
      if (!rendition.book?.locations) return
      const locs = rendition.book.locations as unknown as Record<string, unknown>
      if (!("_locations" in locs) || locs._locations == null) {
        locs._locations = [] as unknown
      }
    } catch {
      // ignore
    }

    rendition.book.ready
      .then(() => {
        const locs = rendition.book.locations
        return locs.generate(1000)
      })
      .then(() => {
        const locs = rendition.book.locations
        locationsReadyRef.current = true
        setEpubTotalPages(locs.length())
        if (locationRef.current) {
          const page = Number(locs.locationFromCfi(locationRef.current))
          if (page > 0) {
            setEpubCurrentPage(page)
            epubCurrentPageRef.current = page
          }
        }
      })
      .catch(() => {})

    rendition.on("selected", (cfiRange: string, contents: { window: Window }) => {
      const selection = contents.window.getSelection()
      if (!selection || selection.isCollapsed) return

      const text = selection.toString().trim()
      if (!text) return

      const range = selection.getRangeAt(0)
      const rects = range.getClientRects()
      if (rects.length === 0) return

      setSelectionCfi(cfiRange)
      setSelectionText(text)

      const firstRect = rects[0]
      setPopover({
        x: firstRect.left + firstRect.width / 2,
        y: firstRect.top + window.scrollY,
      })
    })
  }, [])

  useEffect(() => {
    const rendition = renditionRef.current
    if (!rendition || !highlightsLoaded) return

    const contents = rendition.getContents() as unknown as { document?: Document; window?: { document?: Document } }[]
    contents.forEach((content) => {
      const doc = content.document ?? content.window?.document
      if (!doc) return
      try {
        doc.querySelectorAll('[id^="epubjs-inserted-css-"]').forEach((el) => el.remove())
      } catch {
        // ignore cross-origin or missing document errors
      }
    })

    const { body, background } = EPUB_THEMES[mode]
    rendition.themes.register(mode, {
      ...FLOW_CONSTRAINTS,
      body: { color: body, background, "overflow-x": "hidden" },
      "a:link": { color: mode === "light" ? "#1a4fd8" : "#8ab4f8" },
    })
    rendition.themes.select(mode)

    contents.forEach((content) => {
      const doc = content.document ?? content.window?.document
      if (!doc) return
      try {
        const styleId = "lector-highlight-overrides"
        const existing = doc.getElementById(styleId)
        if (existing) existing.remove()

        if (mode === "sepia") {
          const style = doc.createElement("style")
          style.id = styleId
          style.textContent =
            '.epubjs-hl[data-color="yellow"] { fill: rgba(200, 155, 40, 0.55) !important; }'
          doc.head.appendChild(style)
        }
      } catch {
        // ignore cross-origin
      }
    })
  }, [mode, renditionReady, highlightsLoaded])

  useEffect(() => {
    const rendition = renditionRef.current
    if (!rendition) return
    rendition.themes.fontSize(`${settings.fontSize}%`)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        refreshAllAnnotations()
      })
    })
  }, [settings.fontSize, refreshAllAnnotations])

  useEffect(() => {
    const rendition = renditionRef.current
    if (!rendition) return
    rendition.flow(settings.epubFlow)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        refreshAllAnnotations()
      })
    })
  }, [settings.epubFlow, refreshAllAnnotations])

  const readerStyles = useMemo(
    () => {
      const toc = TOC_THEMES[mode]
      return {
        ...ReactReaderStyle,
        container: {
          ...ReactReaderStyle.container,
          backgroundColor: READER_BACKGROUNDS[mode],
          transition: "background-color 0.3s",
        },
        readerArea: {
          ...ReactReaderStyle.readerArea,
          backgroundColor: READER_BACKGROUNDS[mode],
          transition: "background-color 0.3s",
        },
        tocArea: {
          ...ReactReaderStyle.tocArea,
          background: toc.tocArea.background,
          transition: "background-color 0.3s",
        },
        tocAreaButton: {
          ...ReactReaderStyle.tocAreaButton,
          color: toc.tocAreaButton.color,
          borderBottom: toc.tocAreaButton.borderBottom,
          transition: "color 0.3s, border-color 0.3s",
        },
        tocButtonExpanded: {
          ...ReactReaderStyle.tocButtonExpanded,
          background: toc.tocButtonExpanded.background,
          transition: "background-color 0.3s",
        },
        tocButtonBar: {
          ...ReactReaderStyle.tocButtonBar,
          background: toc.tocButtonBar.background,
          transition: "background-color 0.3s",
        },
      }
    },
    [mode]
  )

  const setFontSize = useCallback((delta: number) => {
    setSettings((prev) => ({
      ...prev,
      fontSize: Math.min(Math.max(prev.fontSize + delta, 75), 175),
    }))
  }, [])

  const toggleFlow = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      epubFlow: prev.epubFlow === "paginated" ? "scrolled" : "paginated",
    }))
  }, [])

  const handleEpubColorSelect = useCallback(
    (color: HighlightColor) => {
      if (!selectionCfi || !selectionText) {
        setPopover(null)
        return
      }

      const rendition = renditionRef.current
      if (rendition) {
        rendition.annotations.highlight(
          selectionCfi,
          { color },
          () => {
            try {
              const range = rendition.getRange(selectionCfi)
              if (range && !range.collapsed) {
                const doc = range.commonAncestorContainer.ownerDocument
                if (doc) {
                  const strong = doc.createElement("span")
                  strong.style.fontWeight = "bold"
                  range.surroundContents(strong)
                }
              }
            } catch {
              // bold wrapping failed silently
            }
          },
          "highlight-" + Date.now(),
          {
            fill: getEffectiveHighlightColor(color, modeRef.current),
            "fill-opacity": "1",
            "mix-blend-mode": "multiply",
          }
        )
      }

      const currentPage = epubCurrentPageRef.current
      const pageLabel: string | undefined =
        currentPage && locationsReadyRef.current
          ? `Página ${currentPage}`
          : undefined

      createHighlight({
        bookId,
        text: selectionText,
        color,
        cfi: selectionCfi,
        pageLabel,
      }).then((result) => {
        if (result.success && result.highlight) {
          setEpubHighlights((prev) => [
            ...prev,
            {
              id: result.highlight!.id,
              text: selectionText,
              color,
              cfi: selectionCfi,
              pageLabel: result.highlight!.pageLabel ?? null,
            },
          ])
        }
      })

      window.getSelection()?.removeAllRanges()
      setPopover(null)
      setSelectionText("")
      setSelectionCfi("")
    },
    [bookId, selectionCfi, selectionText]
  )

  const handleDeleteHighlight = useCallback(
    (highlightId: string) => {
      deleteHighlight(highlightId).then((result) => {
        if (result.success) {
          setEpubHighlights((prev) => prev.filter((h) => h.id !== highlightId))
          setPdfHighlights((prev) => prev.filter((h) => h.id !== highlightId))
          const rendition = renditionRef.current
          if (rendition) {
            rendition.annotations.remove("highlight-" + highlightId, "highlight")
          }
        }
      })
    },
    []
  )

  const navigateToEpubHighlight = useCallback(
    (cfi: string) => {
      const currentLoc = locationRef.current
      setReturnTarget({ epubLocation: currentLoc ?? undefined })
      const rendition = renditionRef.current
      if (rendition && cfi) {
        navigatingToHighlightRef.current = true
        rendition.display(cfi)
      }
      setSidebarOpen(false)
    },
    []
  )

  const navigateToPdfHighlight = useCallback(
    (page: number) => {
      const api = pdfApiRef.current
      if (!api) return
      const currentPage = api.getCurrentPage()
      setReturnTarget({ pdfPage: currentPage })
      navigatingToHighlightRef.current = true
      api.goToPage(page)
      setSidebarOpen(false)
    },
    []
  )

  const handleReturn = useCallback(() => {
    if (!returnTarget) return
    if (returnTarget.epubLocation) {
      const rendition = renditionRef.current
      if (rendition) {
        rendition.display(returnTarget.epubLocation)
      }
    } else if (returnTarget.pdfPage !== undefined) {
      pdfApiRef.current?.goToPage(returnTarget.pdfPage)
    }
    setReturnTarget(null)
  }, [returnTarget])

  const handlePdfCreateHighlight = useCallback((h: PdfHighlight) => {
    setPdfHighlights((prev) => [...prev, h])
  }, [])

  const handlePdfDeleteHighlight = useCallback((highlightId: string) => {
    handleDeleteHighlight(highlightId)
  }, [handleDeleteHighlight])

  const handlePdfPageChange = useCallback(
    (page: number) => {
      setPdfCurrentPage(page)
      lastLocationRef.current = `page:${page}`
      void saveProgress(bookId, `page:${page}`)
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

  const handlePdfTotalPages = useCallback((total: number) => {
    setPdfTotalPages(total)
  }, [])

  const currentPage = isEpub ? epubCurrentPage : pdfCurrentPage
  const totalPages = isEpub ? epubTotalPages : pdfTotalPages

  const handlePageInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.currentTarget.blur()
      }
    },
    []
  )

  const handlePageInputBlur = useCallback(() => {
    setIsEditingPage(false)
    const parsed = parseInt(pageInput, 10)
    if (
      !isNaN(parsed) &&
      parsed >= 1 &&
      parsed <= (totalPages ?? 1) &&
      parsed !== currentPage
    ) {
      if (isPdf) {
        pdfApiRef.current?.goToPage(parsed)
      } else if (isEpub) {
        const rendition = renditionRef.current
        if (
          rendition &&
          rendition.book?.locations &&
          locationsReadyRef.current
        ) {
          const cfi = rendition.book.locations.cfiFromLocation(parsed)
          if (cfi) {
            rendition.display(cfi)
          }
        }
      }
    } else {
      setPageInput(String(currentPage))
    }
  }, [pageInput, totalPages, currentPage, isPdf, isEpub])

  const handlePageInputFocus = useCallback(() => {
    setIsEditingPage(true)
    setPageInput(String(currentPage))
  }, [currentPage])

  const allHighlights = isEpub ? epubHighlights : pdfHighlights

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-3">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft />
            Volver
          </Button>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium sm:text-base">
          {title}
        </h1>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (isPdf) {
                pdfApiRef.current?.goToPage(currentPage - 1)
              } else if (isEpub) {
                const rendition = renditionRef.current
                if (
                  rendition &&
                  rendition.book?.locations &&
                  locationsReadyRef.current &&
                  currentPage > 1
                ) {
                  const cfi =
                    rendition.book.locations.cfiFromLocation(
                      currentPage - 1
                    )
                  if (cfi) rendition.display(cfi)
                }
              }
            }}
            disabled={currentPage <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <input
            type="text"
            inputMode="numeric"
            value={isEditingPage ? pageInput : String(currentPage)}
            onChange={(e) => setPageInput(e.target.value)}
            onFocus={handlePageInputFocus}
            onBlur={handlePageInputBlur}
            onKeyDown={handlePageInputKeyDown}
            className="h-7 w-12 rounded-md border border-input bg-background text-center text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Ir a página"
          />
          <span className="text-sm tabular-nums text-muted-foreground">
            / {totalPages ?? "—"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (isPdf) {
                pdfApiRef.current?.goToPage(currentPage + 1)
              } else if (isEpub) {
                const rendition = renditionRef.current
                if (
                  rendition &&
                  rendition.book?.locations &&
                  locationsReadyRef.current &&
                  totalPages !== null &&
                  currentPage < totalPages
                ) {
                  const cfi =
                    rendition.book.locations.cfiFromLocation(
                      currentPage + 1
                    )
                  if (cfi) rendition.display(cfi)
                }
              }
            }}
            disabled={totalPages !== null && currentPage >= totalPages}
            aria-label="Página siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {isEpub && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFontSize(-10)}
              disabled={settings.fontSize <= 75}
              aria-label="Reducir fuente"
            >
              <Minus className="size-4" />
            </Button>
            <span className="w-10 text-center text-sm tabular-nums text-muted-foreground" suppressHydrationWarning>
              {settings.fontSize}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFontSize(10)}
              disabled={settings.fontSize >= 175}
              aria-label="Aumentar fuente"
            >
              <Plus className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={toggleFlow}>
              {settings.epubFlow === "paginated" ? "Páginas" : "Desplazar"}
            </Button>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <Highlighter className="size-4" />
          Resaltados
        </Button>
        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-h-0 flex-1">
          {!mounted ? (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
              <span>Cargando lector…</span>
            </div>
          ) : isEpub ? (
            <div className="epub-viewer h-full overflow-hidden">
              <ReactReader
                url={proxiedUrl}
                title={title}
                location={location}
                locationChanged={locationChanged}
                getRendition={getRendition}
                readerStyles={readerStyles}
                epubOptions={{ spread: "none" }}
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
          ) : isPdf ? (
            <PdfViewer
              url={proxiedUrl}
              initialPage={parsePdfPage(initialLocation) ?? 1}
              onPageChange={handlePdfPageChange}
              onTotalPagesChange={handlePdfTotalPages}
              bookId={bookId}
              highlights={pdfHighlights}
              onCreateHighlight={handlePdfCreateHighlight}
              onDeleteHighlight={handlePdfDeleteHighlight}
              onReady={handlePdfReady}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Formato no soportado: {format}
            </div>
          )}

          {returnTarget && (
            <div className="absolute bottom-6 left-1/2 z-40 -translate-x-1/2">
              <Button
                variant="default"
                size="sm"
                className="shadow-lg"
                onClick={handleReturn}
              >
                <Undo2 className="size-4" />
                Volver a la página anterior
              </Button>
            </div>
          )}
        </main>

        {sidebarOpen && (
          <aside className="flex w-72 shrink-0 flex-col border-l bg-background">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-medium">Mis Resaltados</h2>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setSidebarOpen(false)}
                aria-label="Cerrar barra lateral"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              {allHighlights.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No hay resaltados. Selecciona texto y elige un color.
                </p>
              ) : (
                <ul className="divide-y">
                  {allHighlights.map((h) => (
                    <li key={h.id} className="px-4 py-3">
                      <button
                        type="button"
                        className="mb-1.5 w-full text-left text-sm leading-relaxed cursor-pointer"
                        onClick={() => {
                          if (isEpub) {
                            const epubH = h as EpubHighlight
                            if (epubH.cfi) navigateToEpubHighlight(epubH.cfi)
                          } else {
                            const pdfH = h as PdfHighlight
                            if (pdfH.pdfPage) navigateToPdfHighlight(pdfH.pdfPage)
                          }
                        }}
                      >
                        <span
                          className="rounded-sm px-1 font-bold"
                          style={{ backgroundColor: HIGHLIGHT_COLORS[h.color] }}
                        >
                          {h.text.length > 120
                            ? h.text.slice(0, 120) + "…"
                            : h.text}
                        </span>
                        {"pageLabel" in h && h.pageLabel ? (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {h.pageLabel}
                          </span>
                        ) : null}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteHighlight(h.id)}
                        aria-label="Eliminar resaltado"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
      </div>

      {popover && isEpub && (
        <HighlightPopover
          x={popover.x}
          y={popover.y}
          onSelect={handleEpubColorSelect}
          onClose={() => {
            setPopover(null)
            setSelectionText("")
            setSelectionCfi("")
            window.getSelection()?.removeAllRanges()
          }}
        />
      )}
    </div>
  )
}
