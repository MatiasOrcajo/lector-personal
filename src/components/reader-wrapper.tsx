"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Rendition } from "epubjs"
import { ReactReader, ReactReaderStyle } from "react-reader"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { useThemeMode } from "@/components/theme-provider"
import { saveProgress } from "@/app/actions/progress"
import {
  loadViewerSettings,
  saveViewerSettings,
  parsePdfPage,
  type ReaderMode,
} from "@/lib/viewer-settings"
import { ArrowLeft, LoaderCircle, Minus, Plus } from "lucide-react"

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

export function ReaderWrapper({
  url,
  format,
  title,
  bookId,
  initialLocation,
}: ReaderWrapperProps) {
  const { mode } = useThemeMode()
  const [settings, setSettings] = useState(() => loadViewerSettings())
  const [location, setLocation] = useState<string | null>(initialLocation)
  const renditionRef = useRef<Rendition | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLocationRef = useRef<string | null>(initialLocation)
  const [renditionReady, setRenditionReady] = useState(false)

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

  const locationChanged = useCallback(
    (loc: string) => {
      setLocation(loc)
      persistLocation(loc)
    },
    [persistLocation]
  )

  const getRendition = useCallback((rendition: Rendition) => {
    renditionRef.current = rendition
    setRenditionReady(true)
  }, [])

  useEffect(() => {
    const rendition = renditionRef.current
    if (!rendition) return

    // epubjs types declare singular but runtime returns Contents[]
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
  }, [mode, renditionReady])

  useEffect(() => {
    const rendition = renditionRef.current
    if (!rendition) return
    rendition.themes.fontSize(`${settings.fontSize}%`)
  }, [settings.fontSize])

  useEffect(() => {
    renditionRef.current?.flow(settings.epubFlow)
  }, [settings.epubFlow])

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

  const isEpub = format.toLowerCase() === "epub"
  const isPdf = format.toLowerCase() === "pdf"

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
            <span className="w-10 text-center text-sm tabular-nums text-muted-foreground">
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
        <ThemeToggle />
      </header>

      <main className="min-h-0 flex-1">
        {isEpub ? (
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
            onPageChange={(page) => {
              lastLocationRef.current = `page:${page}`
              void saveProgress(bookId, `page:${page}`)
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Formato no soportado: {format}
          </div>
        )}
      </main>
    </div>
  )
}
