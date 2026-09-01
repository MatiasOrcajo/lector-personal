"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Page } from "react-pdf"
import { LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const THUMB_WIDTH = 132
const THUMB_MAX_HEIGHT = 190
const THUMB_GAP = 12
const RENDER_BUFFER = 2

/** @pdf-thumbnails-props Props del panel de miniaturas del visor PDF.
 *  @keyword props, abrir, cerrar, tamano-paginas, pagina-actual, navegar */
type PdfThumbnailsProps = {
  pageSizes: { width: number; height: number }[]
  currentPage: number
  onNavigate: (page: number) => void
}

/** @pdf-thumbnails Panel lateral de miniaturas estilo Adobe Acrobat web.
 *  Muestra hasta ~4 páginas con scroll interno propio, marca la página en
 *  lectura (por defecto) y navega al hacer click. Se renderiza dentro del
 *  mismo <Document> del visor (comparte la instancia pdfjs, sin segunda
 *  descarga) y virtualiza el render de miniaturas según el scroll del panel.
 *  Solo visible en pantallas grandes (≥ lg); en mobile queda oculto.
 *  @keyword miniaturas, vista-previa, panel-lateral, Adobe, virtualizacion,
 *  pagina-activa, scroll-interno, desktop */
export function PdfThumbnails({
  pageSizes,
  currentPage,
  onNavigate,
}: PdfThumbnailsProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const activeRef = useRef<HTMLButtonElement | null>(null)
  const [visibleRange, setVisibleRange] = useState<{
    start: number
    end: number
  } | null>(null)

  // ──────────────────────────────────────────────
  //  @miniaturas-calculo Escala/offsets de las miniaturas a partir de los
  //  tamaños reales de página (pageSizes). Mismo patrón que el visor
  //  principal: posicionamiento absoluto + render del rango visible.
  //  @keyword escala, offsets, altura-total, virtualizacion, calculo
  // ──────────────────────────────────────────────
  const thumbScales = useMemo(() => {
    if (!pageSizes || pageSizes.length === 0) return null
    return pageSizes.map((s) =>
      Math.min(THUMB_WIDTH / s.width, THUMB_MAX_HEIGHT / s.height)
    )
  }, [pageSizes])

  const thumbSizes = useMemo(() => {
    if (!thumbScales) return null
    return thumbScales.map((scale, i) => ({
      width: pageSizes[i].width * scale,
      height: pageSizes[i].height * scale,
    }))
  }, [thumbScales, pageSizes])

  const offsets = useMemo(() => {
    if (!thumbSizes) return null
    const arr: number[] = []
    let acc = 0
    for (const s of thumbSizes) {
      arr.push(acc)
      acc += s.height + THUMB_GAP
    }
    return arr
  }, [thumbSizes])

  const totalHeight = useMemo(() => {
    if (!offsets || !thumbSizes || thumbSizes.length === 0) return 0
    return (
      offsets[offsets.length - 1] +
      thumbSizes[thumbSizes.length - 1].height
    )
  }, [offsets, thumbSizes])

  /** @miniaturas-rango Actualiza el rango de miniaturas montadas según el
   *  scroll del panel (con buffer). Evita renderizar cientos de canvases.
   *  @keyword rango-visible, scroll, buffer, virtualizacion */
  const updateVisibleRange = useCallback(() => {
    const el = scrollRef.current
    if (!el || !offsets || !thumbSizes) return
    const n = offsets.length
    if (n === 0) return
    const viewTop = el.scrollTop
    const viewBottom = viewTop + el.clientHeight
    let start = 0
    let end = 0
    let found = false
    for (let i = 0; i < n; i++) {
      const bottom = offsets[i] + thumbSizes[i].height
      if (!found && bottom > viewTop) {
        start = i
        found = true
      }
      if (bottom > viewTop) end = i
      if (offsets[i] > viewBottom) break
    }
    const s = Math.max(0, start - RENDER_BUFFER)
    const e = Math.min(n - 1, end + RENDER_BUFFER)
    setVisibleRange((prev) =>
      prev && prev.start === s && prev.end === e ? prev : { start: s, end: e }
    )
  }, [offsets, thumbSizes])

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null
      updateVisibleRange()
    })
  }, [updateVisibleRange])

  useEffect(() => {
    updateVisibleRange()
  }, [offsets, updateVisibleRange])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => updateVisibleRange())
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateVisibleRange])

  /** @miniaturas-activa Mantiene la miniatura de la página en lectura
   *  visible dentro del panel (scroll "nearest" ante cada cambio de página).
   *  @keyword pagina-activa, scrollIntoView, marcado, sincronizacion */
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest" })
  }, [currentPage])

  if (!thumbScales || !thumbSizes || !offsets || offsets.length === 0) {
    return (
      <aside
        aria-label="Miniaturas de páginas"
        className="hidden shrink-0 flex-col border-r bg-background lg:flex lg:w-44"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-medium text-foreground">Páginas</h2>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-3 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
        </div>
      </aside>
    )
  }

  return (
    <aside
      aria-label="Miniaturas de páginas"
      className="hidden shrink-0 flex-col border-r bg-background lg:flex lg:w-44"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium text-foreground">Páginas</h2>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
          <div className="relative w-full" style={{ height: totalHeight }}>
            {offsets.map((top, i) => {
              const page = i + 1
              const isActive = page === currentPage
              const isRendered =
                visibleRange !== null &&
                page >= visibleRange.start + 1 &&
                page <= visibleRange.end + 1
              const size = thumbSizes[i]
              return (
                <button
                  key={page}
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() => onNavigate(page)}
                  aria-label={`Página ${page}`}
                  aria-current={isActive ? "page" : undefined}
                  data-thumb-active={isActive ? "true" : undefined}
                  className="absolute inset-x-0 flex flex-col items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  style={{ top }}
                >
                  <span
                    className={cn(
                      "relative block overflow-hidden rounded-md border bg-muted transition-opacity",
                      isActive
                        ? "border-primary ring-2 ring-primary"
                        : "border-border opacity-60 hover:opacity-90"
                    )}
                    style={{ width: size.width, height: size.height }}
                  >
                    {isRendered ? (
                      <Page
                        pageNumber={page}
                        scale={thumbScales[i]}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        loading={
                          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <LoaderCircle className="size-4 animate-spin" />
                          </span>
                        }
                        error={
                          <span className="flex h-full w-full items-center justify-center text-[10px] text-destructive">
                            Error
                          </span>
                        }
                      />
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      isActive
                        ? "font-medium text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {page}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>
  )
}