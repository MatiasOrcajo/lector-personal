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
import type {Rendition} from "epubjs"
import {ReactReader, ReactReaderStyle} from "react-reader"
import {Button} from "@/components/ui/button"
import {ThemeToggle} from "@/components/theme-toggle"
import {useThemeMode} from "@/components/theme-provider"
import {HighlightPopover} from "@/components/highlight-popover"
import {saveProgress} from "@/app/actions/progress"
import {
    createHighlight,
    deleteHighlight,
    getBookHighlights,
} from "@/app/actions/highlights"
import type {Highlight as PrismaHighlight} from "@/generated/prisma/client"
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
import type {PdfHighlight, PdfViewerApi} from "@/components/pdf-viewer"

/** @pdf-viewer Carga dinámica del visor PDF con SSR deshabilitado.
 *  El visor PDF se importa de forma lazy porque depende de APIs del navegador
 *  (canvas, DOM) que no existen en el servidor. Se muestra un spinner
 *  mientras se carga el chunk.
 *  @keyword PDF, lazy-load, SSR-disable, dynamic-import, next-dynamic */
const PdfViewer = dynamic<PdfViewerProps>(
    () => import("@/components/pdf-viewer").then((m) => m.PdfViewer),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin"/>
                <span>Cargando PDF…</span>
            </div>
        ),
    }
)

/** @pdf-props Props que recibe el componente PdfViewer.
 *  @keyword PDF, viewer-props, pagina-inicial, navegacion */
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

/** @wrapper-props Props del ReaderWrapper.
 *  @keyword props, url, formato, libro, ubicacion-inicial */
type ReaderWrapperProps = {
    url: string
    format: string
    title: string
    bookId: string
    initialLocation: string | null
}

/** @epub-themes Colores de texto y fondo por cada modo de lectura (light/dark/sepia).
 *  Se registran como themes de epub.js mediante rendition.themes.register().
 *  @keyword tema, tema-epub, colores, modo-lectura, light, dark, sepia */
const EPUB_THEMES: Record<
    ReaderMode,
    { body: string; background: string }
> = {
    light: {body: "#1a1a1a", background: "#ffffff"},
    dark: {body: "#e5e5e5", background: "#111318"},
    sepia: {body: "#5b4636", background: "#f4ecd8"},
}

/** @flow-constraints Restricciones CSS aplicadas a todos los elementos dentro
 *  de las páginas del EPUB para evitar desbordamiento horizontal.
 *  Se inyectan como parte del theme registrado en epub.js.
 *  @keyword overflow, max-width, responsive, fluidez, restricciones-css */
const FLOW_CONSTRAINTS = {
    body: {"overflow-x": "hidden"},
    "*": {"max-width": "100%"},
    img: {"max-width": "100%", height: "auto"},
    svg: {"max-width": "100%", height: "auto"},
    table: {"max-width": "100%"},
    pre: {"max-width": "100%", "white-space": "pre-wrap", "overflow-wrap": "break-word"},
    "div, p, h1, h2, h3, h4, h5, h6": {"max-width": "100%", "overflow-wrap": "break-word"},
}

/** @reader-backgrounds Color de fondo del área de lectura por modo.
 *  Se usa en los estilos del contenedor del ReactReader (readerStyles).
 *  @keyword fondo, background, area-lectura, contenedor */
const READER_BACKGROUNDS: Record<ReaderMode, string> = {
    light: "#ffffff",
    dark: "#111318",
    sepia: "#f4ecd8",
}

/** @toc-themes Estilos del panel de tabla de contenidos (TOC) por modo.
 *  Se fusionan con ReactReaderStyle para respetar el tema activo.
 *  @keyword TOC, tabla-contenidos, indice, panel-lateral, estilos */
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
        tocArea: {background: "#f7f7f7"},
        tocAreaButton: {color: "#555", borderBottom: "1px solid #e0e0e0"},
        tocButtonExpanded: {background: "#f7f7f7"},
        tocButtonBar: {background: "#888"},
    },
    dark: {
        tocArea: {background: "#1a1f2b"},
        tocAreaButton: {color: "#bbb", borderBottom: "1px solid #2a2e38"},
        tocButtonExpanded: {background: "#1a1f2b"},
        tocButtonBar: {background: "#999"},
    },
    sepia: {
        tocArea: {background: "#efe0c8"},
        tocAreaButton: {color: "#5b4636", borderBottom: "1px solid #d8c8a8"},
        tocButtonExpanded: {background: "#efe0c8"},
        tocButtonBar: {background: "#9a8570"},
    },
}

/** @epub-highlight Tipo interno para resaltados de EPUB.
 *  A diferencia del PDF, los resaltados EPUB usan CFI en lugar de
 *  coordenadas de rectángulo.
 *  @keyword tipo, resaltado-epub, CFI, pagina-etiqueta */
type EpubHighlight = {
    id: string
    text: string
    color: HighlightColor
    cfi: string | null
    pageLabel: string | null
}

/** @reader-wrapper Componente principal del lector de libros.
 *  Soporta formatos EPUB (vía react-reader + epubjs) y PDF (vía PdfViewer).
 *  Maneja: navegación por páginas, cambio de tema (light/dark/sepia),
 *  tamaño de fuente, modo de fluidez (paginado/scroll), resaltado de texto,
 *  persistencia de progreso de lectura y barra lateral de resaltados.
 *  @keyword lector, visor-libros, EPUB, PDF, resaltado, progreso, navegacion,
 *  tema, fuente, fluidez, barra-lateral, Server-Action */
export function ReaderWrapper({
                                  url,
                                  format,
                                  title,
                                  bookId,
                                  initialLocation,
                              }: ReaderWrapperProps) {

    // ──────────────────────────────────────────────
    //  @estado-mount Montaje e hidratación
    //  @keyword hidratacion, montaje, SSR, mounted, modo-lectura
    // ──────────────────────────────────────────────
    const [mounted, setMounted] = useState(false)
    const {mode} = useThemeMode()
    const modeRef = useRef(mode)

    useEffect(() => {
        // eslint-disable-next-line
        setMounted(true)
    }, [])

    useEffect(() => {
        modeRef.current = mode
    }, [mode])

    /** @error-sandbox Suprime el error "Blocked script execution in 'about:srcdoc'"
     *  que epub.js emite al cambiar entre modo paginado y scrolled. Es un error
     *  no fatal del motor de epub.js que se produce porque los iframes internos
     *  se recrean sin el permiso allow-scripts en el sandbox.
     *  @keyword sandbox, srcdoc, epubjs-error, flow, allow-scripts, supresion */
    useEffect(() => {
        const handler = (event: ErrorEvent) => {
            if (
                event.message?.includes("about:srcdoc") ||
                event.message?.includes("sandboxed")
            ) {
                event.preventDefault()
                event.stopImmediatePropagation()
            }
        }
        window.addEventListener("error", handler)
        return () => window.removeEventListener("error", handler)
    }, [])

    // ──────────────────────────────────────────────
    //  @estado-settings Configuración del visor
    //  @keyword configuracion, fontSize, epubFlow, persistencia-local
    // ──────────────────────────────────────────────
    const [settings, setSettings] = useState(() => loadViewerSettings())

    // ──────────────────────────────────────────────
    //  @estado-lector Estado del lector EPUB y progreso
    //  @keyword ubicacion, CFI, rendition, guardado-diferido, progreso
    // ──────────────────────────────────────────────
    const [location, setLocation] = useState<string | null>(initialLocation)
    const renditionRef = useRef<Rendition | null>(null)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastLocationRef = useRef<string | null>(initialLocation)
    const [renditionReady, setRenditionReady] = useState(false)

    // ──────────────────────────────────────────────
    //  @estado-paginas Páginas actual y total por formato
    //  @keyword pagina-actual, total-paginas, EPUB, PDF, navegacion
    // ──────────────────────────────────────────────
    const [epubTotalPages, setEpubTotalPages] = useState<number | null>(null)
    const [epubCurrentPage, setEpubCurrentPage] = useState<number>(1)
    const epubCurrentPageRef = useRef<number>(1)
    const locationsReadyRef = useRef(false)

    const [pdfCurrentPage, setPdfCurrentPage] = useState<number>(1)
    const [pdfTotalPages, setPdfTotalPages] = useState<number | null>(null)

    // ──────────────────────────────────────────────
    //  @estado-input-pagina Input numérico de página
    //  @keyword input-pagina, edicion, ir-a-pagina
    // ──────────────────────────────────────────────
    const [pageInput, setPageInput] = useState("1")
    const [isEditingPage, setIsEditingPage] = useState(false)

    const isEpub = format.toLowerCase() === "epub"
    const isPdf = format.toLowerCase() === "pdf"

    // ──────────────────────────────────────────────
    //  @estado-resaltados Selección de texto, popover y resaltados
    //  @keyword resaltado, seleccion-texto, popover, CFI, anotacion
    // ──────────────────────────────────────────────
    const [popover, setPopover] = useState<{ x: number; y: number } | null>(null)
    const [selectionCfi, setSelectionCfi] = useState<string>("")
    const [selectionText, setSelectionText] = useState<string>("")
    const [epubHighlights, setEpubHighlights] = useState<EpubHighlight[]>([])
    const [pdfHighlights, setPdfHighlights] = useState<PdfHighlight[]>([])
    const [highlightsLoaded, setHighlightsLoaded] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)

    // ──────────────────────────────────────────────
    //  @estado-retorno Target para botón "Volver a la página anterior"
    //  @keyword retorno, volver, navegar-resaltado, bookmark-temporal
    // ──────────────────────────────────────────────
    const [returnTarget, setReturnTarget] = useState<{
        epubLocation?: string
        pdfPage?: number
    } | null>(null)

    // ──────────────────────────────────────────────
    //  @refs Referencias compartidas entre callbacks
    //  @keyword referencia, ref, PDF-API, ubicacion-actual, navegacion-resaltado
    // ──────────────────────────────────────────────
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

    /** @proxied-url URL del archivo servida a través del proxy interno de Next.js
     *  para evitar problemas de CORS con Blob Storage.
     *  @keyword proxy, API-route, CORS, blob-url */
    const proxiedUrl = `/api/file?url=${encodeURIComponent(url)}`

    // ──────────────────────────────────────────────
    //  @persistencia-ubicacion Guarda la ubicación de lectura con debounce.
    //  Espera 1.2s de inactividad antes de llamar a saveProgress (Server Action).
    //  Al desmontar el componente, guarda la última ubicación pendiente.
    //  @keyword persistencia, progreso, guardado-diferido, debounce, Server-Action,
    //  saveProgress, cleanup, desmontaje
    // ──────────────────────────────────────────────
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

    // ──────────────────────────────────────────────
    //  @persistencia-settings Guarda configuración del visor en localStorage
    //  cada vez que cambia (fontSize, epubFlow, etc.).
    //  @keyword configuracion, localStorage, persistencia, fuente, fluidez
    // ──────────────────────────────────────────────
    useEffect(() => {
        saveViewerSettings(settings)
    }, [settings])

    /** @pdf-ready Callback que recibe la API del visor PDF cuando está listo.
     *  @keyword PDF, API, visor, inicializacion */
    const handlePdfReady = useCallback((api: PdfViewerApi) => {
        pdfApiRef.current = api
    }, [])

    // ──────────────────────────────────────────────
    //  @resaltado-epub-render Renderiza resaltados EPUB en el DOM del libro.
    //  Usa rendition.annotations.highlight() de epub.js con el color efectivo
    //  según el modo de lectura actual. El callback de mutación DOM está
    //  intencionalmente vacío para evitar corrupción del contenido interno.
    //  @keyword resaltado, anotacion, epubjs-highlight, annotations, rendition,
    //  render-resaltado, color-efectivo, blend-mode
    // ──────────────────────────────────────────────
    const applyHighlightsToRendition = useCallback(
        (rendition: Rendition, items: EpubHighlight[]) => {
            items.forEach((h) => {
                if (h.cfi) {
                    rendition.annotations.highlight(
                        h.cfi,
                        {color: h.color},
                        () => {
                            // Callback intencionalmente vacío.
                            // NUNCA mutar el DOM interno con surroundContents aquí.
                        },
                        "highlight-" + h.id,
                        {
                            fill: getEffectiveHighlightColor(h.color, modeRef.current),
                            "fill-opacity": "0.4",
                        }
                    )
                }
            })
        },
        []
    )

    /** @resaltado-epub-refresh Borra y re-aplica todos los resaltados EPUB sobre
     *  la rendition actual. Se llama después de cambios de tema, fuente o fluidez
     *  porque epub.js regenera el DOM interno y pierde los highlights.
     *  @keyword refrescar-resaltados, re-aplicar, anotacion, limpieza-capa,
     *  reflow, epubjs-annotation-layer */
    const refreshAllAnnotations = useCallback(() => {
        const rendition = renditionRef.current
        if (!rendition) return
        const items = epubHighlightsRef.current

        items.forEach((h) => {
            try {
                // CORRECCIÓN: Usar h.cfi en lugar de "highlight-" + h.id
                if (h.cfi) rendition.annotations.remove(h.cfi, "highlight")
            } catch {
                // highlight may not exist yet
            }
        })

        const contents = rendition.getContents() as unknown as {
            document?: Document;
            window?: { document?: Document }
        }[]
        contents.forEach((content) => {
            const doc = content.document ?? content.window?.document
            if (!doc) return
            const layer = doc.querySelector(".epubjs-annotation-layer")
            if (layer) layer.innerHTML = ""
        })

        applyHighlightsToRendition(rendition, items)
    }, [applyHighlightsToRendition])

    // ──────────────────────────────────────────────
    //  @carga-resaltados Carga los resaltados desde la DB al montar el componente.
    //  Separa por formato: los que tienen CFI van a EPUB, los que tienen pdfPage
    //  y pdfRects van a PDF. Si la rendition ya existe, los aplica de inmediato.
    //  @keyword carga-inicial, base-de-datos, Prisma, Server-Action,
    //  getBookHighlights, CFI, pdfRects, separar-formato
    // ──────────────────────────────────────────────
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

    /** @resaltado-epub-ready Aplica resaltados cuando la rendition y los datos
     *  de la DB ya están disponibles. Cubre el caso en que la rendition se
     *  inicializa después de que los highlights ya fueron cargados.
     *  @keyword rendition-ready, aplicar-resaltados, sincronizacion-estado */
    useEffect(() => {
        if (!renditionReady || !highlightsLoaded) return
        const rendition = renditionRef.current
        if (!rendition) return
        applyHighlightsToRendition(rendition, epubHighlightsRef.current)
    }, [renditionReady, highlightsLoaded, applyHighlightsToRendition])

    // ──────────────────────────────────────────────
    //  @navegacion-ubicacion Callback de cambio de ubicación del ReactReader.
    //  Se dispara en cada cambio de página/scroll del EPUB. Persiste la ubicación
    //  y actualiza el número de página actual. Si la navegación fue disparada
    //  por un click en resaltado, resetea la bandera y el returnTarget.
    //  @keyword locationChanged, ubicacion-cambio, CFI, pagina-actual,
    //  navegacion-resaltado, returnTarget, persistir-ubicacion
    // ──────────────────────────────────────────────
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

    // ──────────────────────────────────────────────
    //  @inicializacion-epub Callback getRendition del ReactReader.
    //  Recibe la instancia de Rendition de epub.js y configura:
    //  1. Workaround para bug de Locations._locations indefinido.
    //  2. Generación de locations (1000 segmentos).
    //  3. Cálculo de total de páginas y página actual.
    //  4. Listener del evento "selected" para capturar selección de texto.
    //  @keyword getRendition, inicializacion-epubjs, rendition, locations,
    //  generate, bug-workaround, selected-event, seleccion-texto
    // ──────────────────────────────────────────────
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
            .catch(() => {
            })

        /** @evento-selected Listener del evento "selected" de epub.js.
         *  Se dispara cuando el usuario selecciona texto en el libro.
         *  1. Valida que la selección no esté colapsada ni vacía.
         *  2. Obtiene el CFI del rango seleccionado.
         *  3. Calcula la posición del popover sumando el offset del iframe
         *     de epub.js para que el tooltip (position:fixed) aparezca
         *     correctamente dentro de la app de Next.js.
         *  @keyword seleccion-texto, evento-selected, range, getClientRects,
         *  iframe-offset, popover-posicion, tooltip-fixed, epubjs */
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

            // Capturamos el iframe donde epub.js renderiza el libro
            const iframe = contents.window.frameElement as HTMLIFrameElement | null
            const iframeRect = iframe?.getBoundingClientRect()

            // Sumamos el offset del iframe dentro de nuestra app de Next.js
            const offsetX = iframeRect?.left ?? 0
            const offsetY = iframeRect?.top ?? 0

            setPopover({
                x: offsetX + firstRect.left + (firstRect.width / 2),
                y: offsetY + firstRect.top, // Removimos window.scrollY porque el tooltip usa 'fixed'
            })
        })
    }, [])

    // ──────────────────────────────────────────────
    //  @cambio-tema Aplica el tema de lectura al EPUB cuando cambia el modo.
    //  1. Elimina CSS inyectado por recargas anteriores de epub.js.
    //  2. Registra y selecciona el theme en la rendition.
    //  3. En modo sepia, inyecta un override CSS para mejorar visibilidad
    //     del resaltado amarillo.
    //  @keyword tema, modo-lectura, light, dark, sepia, rendition-themes,
    //  register, select, css-override, epubjs-css, cross-origin
    // ──────────────────────────────────────────────
    useEffect(() => {
        const rendition = renditionRef.current
        if (!rendition || !highlightsLoaded) return

        const contents = rendition.getContents() as unknown as {
            document?: Document;
            window?: { document?: Document }
        }[]
        contents.forEach((content) => {
            const doc = content.document ?? content.window?.document
            if (!doc) return
            try {
                doc.querySelectorAll('[id^="epubjs-inserted-css-"]').forEach((el) => el.remove())
            } catch {
                // ignore cross-origin or missing document errors
            }
        })

        const {body, background} = EPUB_THEMES[mode]
        rendition.themes.register(mode, {
            ...FLOW_CONSTRAINTS,
            body: {color: body, background, "overflow-x": "hidden"},
            "a:link": {color: mode === "light" ? "#1a4fd8" : "#8ab4f8"},
        })
        rendition.themes.select(mode)

        contents.forEach((content) => {
            const doc = content.document ?? content.window?.document
            if (!doc) return
            try {
                const styleId = "lector-highlight-overrides"
                const existing = doc.getElementById(styleId)
                if (existing) existing.remove()

                // 1. CREAMOS la etiqueta style SIEMPRE (sin importar el modo de lectura)
                const style = doc.createElement("style")
                style.id = styleId

                // 2. Definimos la regla de mezcla para que el texto resalte por encima del color
                let cssText = `
            .epubjs-hl {
                pointer-events: none !important;
                mix-blend-mode: ${mode === 'dark' ? 'screen' : 'multiply'} !important;
            }
        `

                // 3. Mantenemos tu regla original SUMÁNDOLA al CSS solo si es modo sepia
                if (mode === "sepia") {
                    cssText += `
                .epubjs-hl[data-color="yellow"] { fill: rgba(200, 155, 40, 0.55) !important; }
            `
                }

                // 4. Asignamos todo el CSS al elemento style y lo inyectamos
                style.textContent = cssText
                doc.head.appendChild(style)

            } catch {
                // ignore cross-origin
            }
        })
    }, [mode, renditionReady, highlightsLoaded])

    // ──────────────────────────────────────────────
    //  @cambio-fuente Aplica el tamaño de fuente a la rendition cuando cambia.
    //  @keyword fontSize, fuente, tamaño-letra, rendition-themes
    // ──────────────────────────────────────────────
    useEffect(() => {
        const rendition = renditionRef.current
        if (!rendition) return
        rendition.themes.fontSize(`${settings.fontSize}%`)
    }, [settings.fontSize, refreshAllAnnotations])

    // ──────────────────────────────────────────────
    //  @cambio-fluidez Cambia el modo de fluidez (paginated/scrolled) y
    //  refresca los resaltados después de un breve delay para que epub.js
    //  termine el reflow del DOM.
    //  @keyword epubFlow, fluidez, paginado, scroll, reflow, setTimeout,
    //  refrescar-resaltados
    // ──────────────────────────────────────────────
    useEffect(() => {
        const rendition = renditionRef.current
        if (!rendition) return
        rendition.flow(settings.epubFlow)

        const timer = setTimeout(() => {
            refreshAllAnnotations()
        }, 250)

        return () => clearTimeout(timer)
    }, [settings.epubFlow, refreshAllAnnotations])

    /** @reader-styles Estilos del ReactReader fusionados con los colores del tema
     *  activo. Se recalcula con useMemo cada vez que cambia el modo de lectura.
     *  Aplica transiciones suaves en cambios de color de fondo.
     *  @keyword estilos-lector, ReactReaderStyle, contenedor, readerArea,
     *  TOC, tabla-contenidos, transicion, fondo, colores-tema */
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

    /** @ajustar-fuente Incrementa/disminuye el tamaño de fuente dentro del
     *  rango [75%, 175%] en pasos de 10.
     *  @keyword setFontSize, ajustar-fuente, zoom, incremento, decremento FUNCIÓN QUE EJECUTA EL CAMBIO DE TAMAÑO DE FUENTE */
    const setFontSize = useCallback((delta: number) => {
        setSettings((prev) => ({
            ...prev,
            fontSize: Math.min(Math.max(prev.fontSize + delta, 75), 175),
        }))
    }, [])

    /** @toggle-flow Alterna entre modo paginado y scroll continuo.
     *  @keyword toggleFlow, paginado, scrolled, alternar-fluidez */
    const toggleFlow = useCallback(() => {
        setSettings((prev) => ({
            ...prev,
            epubFlow: prev.epubFlow === "paginated" ? "scrolled" : "paginated",
        }))
    }, [])

    // ──────────────────────────────────────────────
    //  @crear-resaltado-epub Procesa la selección de color del popover.
    //  Crea el resaltado visual en la rendition de epub.js y persiste en la DB
    //  mediante la Server Action createHighlight. Asigna una etiqueta de página
    //  basada en la página actual si las locations ya están listas.
    //  @keyword crear-resaltado, seleccion-color, popover, anotacion,
    //  Server-Action, createHighlight, pagina-actual, pageLabel
    // ──────────────────────────────────────────────
    const handleEpubColorSelect = useCallback(
        (color: HighlightColor) => {
            if (!selectionCfi || !selectionText) {
                setPopover(null)
                return
            }

            // Capturar valores actuales antes del cleanup de seleccion
            const cfi = selectionCfi
            const text = selectionText

            // Cleanup inmediato de la selección y popover
            window.getSelection()?.removeAllRanges()
            setPopover(null)
            setSelectionText("")
            setSelectionCfi("")

            // ID temporal generado en el cliente. Se usa como clase del SVG en
            // epub.js y luego se reemplaza por el ID real que devuelve Prisma.
            const clientId = crypto.randomUUID()

            const rendition = renditionRef.current
            if (rendition) {
                rendition.annotations.highlight(
                    cfi,
                    {color},
                    () => {
                        // Callback intencionalmente vacío.
                        // Eliminamos la lógica de range.surroundContents(strong)
                    },
                    "highlight-" + clientId,
                    {
                        fill: getEffectiveHighlightColor(color, modeRef.current),
                        "fill-opacity": "0.4",
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
                text,
                color,
                cfi,
                pageLabel,
            }).then((result) => {
                if (result.success && result.highlight) {
                    const realId = result.highlight.id

                    // Reemplazar la anotación temporal por una con el ID real de la DB.
                    // Así handleDeleteHighlight puede eliminarla sin desfase de IDs.
                    const rend = renditionRef.current
                    if (rend) {
                        try {
                            // CORRECCIÓN: Usar cfi en lugar de "highlight-" + clientId
                            rend.annotations.remove(cfi, "highlight")
                        } catch {
                            // puede no existir
                        }
                        rend.annotations.highlight(
                            cfi,
                            { color },
                            () => {},
                            "highlight-" + realId,
                            {
                                fill: getEffectiveHighlightColor(color, modeRef.current),
                                "fill-opacity": "0.5",
                                "mix-blend-mode": "multiply",
                            }
                        )
                    }

                    setEpubHighlights((prev) => [
                        ...prev,
                        {
                            id: realId,
                            text,
                            color,
                            cfi,
                            pageLabel: result.highlight!.pageLabel ?? null,
                        },
                    ])
                }
            })
        },
        [bookId, selectionCfi, selectionText]
    )

    /** @eliminar-resaltado Elimina un resaltado de la DB (Server Action
     *  deleteHighlight) y lo remueve del estado local y de la rendition EPUB.
     *  Para EPUB requiere el CFI del resaltado porque epub.js usa el CFI
     *  (no el className) como clave para annotations.remove().
     *  @keyword eliminar-resaltado, deleteHighlight, Server-Action, anotacion,
     *  remover, CFI, annotations-remove */
    const handleDeleteHighlight = useCallback(
        (highlightId: string, cfi?: string | null) => {
            deleteHighlight(highlightId).then((result) => {
                if (result.success) {
                    setEpubHighlights((prev) => prev.filter((h) => h.id !== highlightId))
                    setPdfHighlights((prev) => prev.filter((h) => h.id !== highlightId))

                    const rendition = renditionRef.current
                    if (rendition && cfi) {
                        // CORRECCIÓN: Restablecido para usar el cfi correctamente
                        rendition.annotations.remove(cfi, "highlight")
                    }
                }
            })
        },
        []
    )

    /** @navegar-resaltado-epub Navega a un resaltado EPUB por su CFI.
     *  Guarda la ubicación actual como returnTarget para que el usuario pueda
     *  volver después. Cierra la barra lateral.
     *  @keyword navegar-resaltado, CFI, rendition-display, returnTarget,
     *  barra-lateral, sidebar */
    const navigateToEpubHighlight = useCallback(
        (cfi: string) => {
            const currentLoc = locationRef.current
            setReturnTarget({epubLocation: currentLoc ?? undefined})
            const rendition = renditionRef.current
            if (rendition && cfi) {
                navigatingToHighlightRef.current = true
                rendition.display(cfi)
            }
            setSidebarOpen(false)
        },
        []
    )

    /** @navegar-resaltado-pdf Navega a un resaltado PDF por número de página.
     *  Guarda la página actual como returnTarget. Cierra la barra lateral.
     *  @keyword PDF, navegar-resaltado, goToPage, pagina, returnTarget */
    const navigateToPdfHighlight = useCallback(
        (page: number) => {
            const api = pdfApiRef.current
            if (!api) return
            const currentPage = api.getCurrentPage()
            setReturnTarget({pdfPage: currentPage})
            navigatingToHighlightRef.current = true
            api.goToPage(page)
            setSidebarOpen(false)
        },
        []
    )

    /** @volver-posicion-anterior Retorna a la ubicación guardada en returnTarget
     *  (la posición desde donde el usuario navegó a un resaltado).
     *  @keyword volver, retorno, pagina-anterior, bookmark, Undo2 */
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

    // ──────────────────────────────────────────────
    //  @handlers-pdf Callbacks delegados al visor PDF.
    //  @keyword PDF, crear-resaltado, eliminar-resaltado, cambio-pagina
    // ──────────────────────────────────────────────
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

    /** @pagina-actual Página actual unificada para ambos formatos.
     *  @keyword pagina-actual, unificado, EPUB, PDF */
    const currentPage = isEpub ? epubCurrentPage : pdfCurrentPage
    const totalPages = isEpub ? epubTotalPages : pdfTotalPages

    // ──────────────────────────────────────────────
    //  @input-pagina-handlers Manejo del input de página (teclado y foco).
    //  Al presionar Enter hace blur. Al perder el foco valida y navega.
    //  @keyword input-pagina, teclado, Enter, blur, focus, validar, navegar,
    //  CFI, goToPage, cfiFromLocation
    // ──────────────────────────────────────────────
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

    /** @todos-resaltados Lista unificada de resaltados para la barra lateral.
     *  @keyword resaltados, sidebar, lista-unificada, EPUB, PDF */
    const allHighlights = isEpub ? epubHighlights : pdfHighlights

    // ──────────────────────────────────────────────
    //  @render Renderizado del componente.
    //  @keyword render, JSX, layout, header, main, sidebar, popover
    // ──────────────────────────────────────────────
    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
            {/**
             * @header Barra superior con:
             * - Botón Volver (Link a "/")
             * - Título del libro
             * - Navegación de páginas (anterior / input / siguiente)
             * - Controles EPUB: zoom de fuente y toggle de fluidez
             * - Botón de resaltados (abre/cierra sidebar)
             * - ThemeToggle (light/dark/sepia)
             * @keyword header, barra-superior, navegacion, controles, titulo */}
            <header className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-3">
                <Link href="/">
                    <Button variant="outline" size="sm">
                        <ArrowLeft/>
                        Volver
                    </Button>
                </Link>
                <h1 className="min-w-0 flex-1 truncate text-sm font-medium sm:text-base">
                    {title}
                </h1>

                {/** @navegacion-paginas Controles de página: botón anterior, input
                 *  numérico editable, contador total, botón siguiente.
                 *  @keyword paginacion, anterior, siguiente, input-numerico */}
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
                        <ChevronLeft className="size-4"/>
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
                        <ChevronRight className="size-4"/>
                    </Button>
                </div>

                {/** @controles-epub Controles exclusivos para EPUB: zoom de fuente
                 *  (botones +/-) y toggle de fluidez (paginado/scroll).
                 *  @keyword EPUB, zoom, fuente, fluidez, paginado, scroll */}
                {isEpub && (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setFontSize(-10)}
                            disabled={settings.fontSize <= 75}
                            aria-label="Reducir fuente"
                        >
                            <Minus className="size-4"/>
                        </Button>
                        <span className="w-10 text-center text-sm tabular-nums text-muted-foreground"
                              suppressHydrationWarning>
              {settings.fontSize}%
            </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setFontSize(10)}
                            disabled={settings.fontSize >= 175}
                            aria-label="Aumentar fuente"
                        >
                            <Plus className="size-4"/>
                        </Button>
                        <Button variant="outline" size="sm" onClick={toggleFlow}>
                            {settings.epubFlow === "paginated" ? "Páginas" : "Desplazar"}
                        </Button>
                    </div>
                )}

                {/** @boton-sidebar Botón para abrir/cerrar la barra lateral de resaltados.
                 *  @keyword sidebar, resaltados, toggle, Highlighter */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSidebarOpen((v) => !v)}
                >
                    <Highlighter className="size-4"/>
                    Resaltados
                </Button>
                <ThemeToggle/>
            </header>

            {/**
             * @contenido-principal Área principal con el lector y la barra lateral.
             *  Layout flex horizontal: main ocupa el espacio restante, sidebar es fija.
             *  @keyword main, contenido, lector, sidebar, layout-flex */}
            <div className="flex min-h-0 flex-1">
                <main className="relative min-h-0 flex-1">

                    {/**
                     * @switch-formato Renderiza el componente correcto según el formato:
                     * - Antes de montar: spinner de carga.
                     * - EPUB: ReactReader de react-reader.
                     * - PDF: PdfViewer con carga lazy (dynamic import).
                     * - Otro: mensaje de formato no soportado.
                     * @keyword formato, EPUB, PDF, ReactReader, PdfViewer, lazy-load */}
                    {!mounted ? (
                        <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                            <LoaderCircle className="size-5 animate-spin"/>
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
                                epubOptions={{spread: "none"}}
                                loadingView={
                                    <div
                                        className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                                        <LoaderCircle className="size-5 animate-spin"/>
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

                    {/**
                     * @boton-retorno Botón flotante "Volver a la página anterior".
                     *  Visible solo cuando returnTarget no es null (el usuario navegó
                     *  a un resaltado desde otra página).
                     *  @keyword boton-retorno, volver, pagina-anterior, Undo2, flotante */}
                    {returnTarget && (
                        <div className="absolute bottom-6 left-1/2 z-40 -translate-x-1/2">
                            <Button
                                variant="default"
                                size="sm"
                                className="shadow-lg"
                                onClick={handleReturn}
                            >
                                <Undo2 className="size-4"/>
                                Volver a la página anterior
                            </Button>
                        </div>
                    )}
                </main>

                {/**
                 * @barra-lateral-resaltados Barra lateral con la lista de resaltados.
                 *  Cada item muestra el texto resaltado con su color de fondo y
                 *  etiqueta de página. Click en el texto → navega al resaltado.
                 *  Botón trash → elimina el resaltado.
                 *  @keyword sidebar, barra-lateral, resaltados, lista, navegar,
                 *  eliminar, color, pagina */}
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
                                <X className="size-4"/>
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
                            className="rounded-sm px-1"
                            style={{backgroundColor: HIGHLIGHT_COLORS[h.color]}}
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
                                                onClick={() => handleDeleteHighlight(h.id, "cfi" in h ? (h as EpubHighlight).cfi : null)}
                                                aria-label="Eliminar resaltado"
                                            >
                                                <Trash2 className="size-3.5"/>
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </aside>
                )}
            </div>

            {/**
             * @popover-resaltado Popover de selección de color para resaltar texto.
             *  Solo visible en EPUB cuando hay una selección activa (popover no nulo).
             *  Delega en HighlightPopover la UI de botones de color.
             *  @keyword popover, seleccion-color, HighlightPopover, EPUB, onClose */}
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
