"use client"

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import type {NavItem, Rendition} from "epubjs"
import {ReactReader, ReactReaderStyle} from "react-reader"
import {Button} from "@/components/ui/button"
import {useThemeMode} from "@/components/theme-provider"
import {HighlightPopover} from "@/components/highlight-popover"
import {ReaderHeader} from "@/components/reader-header"
import {HighlightSidebar} from "@/components/highlight-sidebar"
import {ReturnButton} from "@/components/return-button"
import {saveProgress} from "@/app/actions/progress"
import {
    createHighlight,
    deleteHighlight,
    getBookHighlights,
} from "@/app/actions/highlights"
import type {Highlight as PrismaHighlight} from "@/generated/prisma/client"
import {
    useEpubViewerSettings,
    getEffectiveHighlightColor,
    type HighlightColor,
    type ReaderMode,
} from "@/lib/viewer-settings"
import type {ReaderHighlight} from "@/lib/reader-types"
import {LoaderCircle, Minus, Plus} from "lucide-react"

/** @epub-reader-props Props del visor EPUB.
 *  @keyword props, url, titulo, libro, ubicacion-inicial */
type EpubReaderProps = {
    url: string
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
    html: {
        "overflow-y": "auto !important",
        "-webkit-overflow-scrolling": "touch !important"
    },
    body: {
        "overflow-x": "hidden !important",
        "overflow-y": "auto !important",
        "-webkit-overflow-scrolling": "touch !important"
    },
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

/** @toc-active-styles Estilos que se aplican al item de la tabla de contenidos
 *  correspondiente a la sección que se está leyendo. Se inyectan por DOM
 *  (react-reader no expone un prop para marcar el item activo).
 *  @keyword TOC, item-activo, seccion-actual, resaltar, estilos */
const ACTIVE_TOC_STYLES: Record<
    ReaderMode,
    { background: string; color: string; accent: string }
> = {
    light: {background: "rgba(26, 79, 216, 0.08)", color: "#1a1a1a", accent: "#1a4fd8"},
    dark: {background: "rgba(138, 180, 248, 0.14)", color: "#ffffff", accent: "#8ab4f8"},
    sepia: {background: "rgba(91, 70, 54, 0.10)", color: "#3f2f22", accent: "#5b4636"},
}

/** @flatten-toc Aplana el árbol de navegación del libro en orden depth-first.
 *  react-reader renderiza los botones del TOC en el mismo orden, por lo que
 *  el índice plano permite ubicar el botón del item activo en el DOM.
 *  @keyword TOC, aplanar, depth-first, orden, indice-plano */
function flattenToc(items: NavItem[]): NavItem[] {
    const flat: NavItem[] = []
    const walk = (list: NavItem[]) => {
        for (const item of list) {
            flat.push(item)
            if (item.subitems && item.subitems.length > 0) {
                walk(item.subitems)
            }
        }
    }
    walk(items)
    return flat
}

/** @seccion-activa Busca el índice (en el TOC aplanado) de la sección cuyo
 *  href coincide con el de la sección actual del libro. Compara sin fragmentos
 *  (#) y decodificando URIs para tolerar diferencias de formato entre el TOC
 *  y el spine. Devuelve -1 si no hay coincidencia.
 *  @keyword TOC, indice-activo, href, spine, coincidencia, fragmento */
function findActiveTocIndex(toc: NavItem[], href: string | null): number {
    if (!href) return -1
    const normalize = (value: string) => {
        const withoutFragment = value.split("#")[0].toLowerCase()
        try {
            return decodeURIComponent(withoutFragment)
        } catch {
            return withoutFragment
        }
    }
    const target = normalize(href)
    return flattenToc(toc).findIndex((item) => {
        if (!item.href) return false
        return normalize(item.href) === target
    })
}

/** @epub-reader Visor de libros EPUB (react-reader + epubjs).
 *  Componente autocontenido: descarga del libro, rendition, themes, TOC,
 *  navegación por páginas, resaltados, persistencia de progreso y barra
 *  lateral. No comparte estado con el visor PDF.
 *  @keyword lector, visor-EPUB, epubjs, ReactReader, resaltado, progreso,
 *  navegacion, tema, fuente, fluidez, barra-lateral, Server-Action */
export function EpubReader({
    url,
    title,
    bookId,
    initialLocation,
}: EpubReaderProps) {
    // ──────────────────────────────────────────────
    //  @estado-mount Montaje, hidratación y media queries
    //  @keyword hidratacion, montaje, SSR, mounted, mobile
    // ──────────────────────────────────────────────
    const [mounted, setMounted] = useState(false)
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const mql = window.matchMedia("(max-width: 639px)")
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMobile(mql.matches)
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
        mql.addEventListener("change", handler)
        return () => mql.removeEventListener("change", handler)
    }, [])
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
    //  @estado-settings Configuración exclusiva del visor EPUB
    //  @keyword configuracion, fontSize, epubFlow, persistencia-local
    // ──────────────────────────────────────────────
    const {settings, setFontSize, toggleFlow} = useEpubViewerSettings()

    // ──────────────────────────────────────────────
    //  @estado-lector Estado del lector EPUB y progreso
    //  @keyword ubicacion, CFI, rendition, guardado-diferido, progreso
    // ──────────────────────────────────────────────
    /** @epub-data Buffer del EPUB descargado en el cliente.
     *  Se pasa como ArrayBuffer a react-reader para que epub.js abra el libro
     *  en modo BINARY (desde memoria) y NO resuelva los archivos internos
     *  (META-INF/container.xml, capítulos, imágenes) como URLs contra la
     *  página. Con la URL del proxy (/api/file?url=...) epub.js los resuelve
     *  contra /read/... (404) y el lector queda en blanco.
     *  @keyword EPUB, ArrayBuffer, BINARY, fetch, proxy, descarga-cliente */
    const [epubData, setEpubData] = useState<ArrayBuffer | null>(null)
    const [epubError, setEpubError] = useState<string | null>(null)

    const [location, setLocation] = useState<string | null>(initialLocation)
    const locationRef = useRef(location)
    const renditionRef = useRef<Rendition | null>(null)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastLocationRef = useRef<string | null>(initialLocation)
    const [renditionReady, setRenditionReady] = useState(false)

    useEffect(() => {
        locationRef.current = location
    }, [location])

    // ──────────────────────────────────────────────
    //  @estado-toc Tabla de contenidos y sección actual
    //  @keyword TOC, indice, seccion-actual, href, item-activo
    // ──────────────────────────────────────────────
    const [toc, setToc] = useState<NavItem[]>([])
    const [currentSectionHref, setCurrentSectionHref] = useState<string | null>(null)
    const activeTocIndex = useMemo(
        () => findActiveTocIndex(toc, currentSectionHref),
        [toc, currentSectionHref]
    )

    // ──────────────────────────────────────────────
    //  @estado-paginas Páginas actual y total del EPUB
    //  @keyword pagina-actual, total-paginas, navegacion, locations
    // ──────────────────────────────────────────────
    const [epubTotalPages, setEpubTotalPages] = useState<number | null>(null)
    const [epubCurrentPage, setEpubCurrentPage] = useState<number>(1)
    const epubCurrentPageRef = useRef<number>(1)
    const locationsReadyRef = useRef(false)

    // ──────────────────────────────────────────────
    //  @estado-resaltados Selección de texto, popover y resaltados
    //  @keyword resaltado, seleccion-texto, popover, CFI, anotacion
    // ──────────────────────────────────────────────
    const [popover, setPopover] = useState<{ x: number; y: number } | null>(null)
    const [selectionCfi, setSelectionCfi] = useState<string>("")
    const [selectionText, setSelectionText] = useState<string>("")
    const [epubHighlights, setEpubHighlights] = useState<ReaderHighlight[]>([])
    const [highlightsLoaded, setHighlightsLoaded] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)

    // ──────────────────────────────────────────────
    //  @estado-retorno Target para botón "Volver a la página anterior"
    //  @keyword retorno, volver, navegar-resaltado, bookmark-temporal
    // ──────────────────────────────────────────────
    const [returnTarget, setReturnTarget] = useState<{
        epubLocation?: string
    } | null>(null)

    // ──────────────────────────────────────────────
    //  @refs Referencias compartidas entre callbacks
    //  @keyword referencia, ref, ubicacion-actual, navegacion-resaltado
    // ──────────────────────────────────────────────
    const navigatingToHighlightRef = useRef(false)
    const epubHighlightsRef = useRef<ReaderHighlight[]>([])
    const touchStartXRef = useRef(0)
    const touchStartYRef = useRef(0)

    useEffect(() => {
        epubHighlightsRef.current = epubHighlights
    }, [epubHighlights])

    // ──────────────────────────────────────────────
    //  @descarga-epub Descarga el EPUB en el cliente como ArrayBuffer.
    //  epub.js necesita el libro como datos binarios (modo BINARY) para no
    //  resolver los archivos internos del zip como URLs relativas a la página.
    //  Si la descarga falla, se muestra un error en lugar del lector en blanco.
    //  @keyword EPUB, fetch, ArrayBuffer, descarga, error-descarga, cancelacion
    // ──────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEpubError(null)
        setEpubData(null)
        fetch(url)
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.arrayBuffer()
            })
            .then((buffer) => {
                if (!cancelled) setEpubData(buffer)
            })
            .catch(() => {
                if (!cancelled) setEpubError("No se pudo descargar el EPUB.")
            })
        return () => {
            cancelled = true
        }
    }, [url])

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
    //  @resaltado-epub-render Renderiza resaltados EPUB en el DOM del libro.
    //  Usa rendition.annotations.highlight() de epub.js con el color efectivo
    //  según el modo de lectura actual. El callback de mutación DOM está
    //  intencionalmente vacío para evitar corrupción del contenido interno.
    //  @keyword resaltado, anotacion, epubjs-highlight, annotations, rendition,
    //  render-resaltado, color-efectivo, blend-mode
    // ──────────────────────────────────────────────
    const applyHighlightsToRendition = useCallback(
        (rendition: Rendition, items: ReaderHighlight[]) => {
            items.forEach((h) => {
                if (h.location) {
                    rendition.annotations.highlight(
                        h.location,
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
                if (h.location) rendition.annotations.remove(h.location, "highlight")
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
    //  @carga-resaltados Carga los resaltados de este libro desde la DB.
    //  Solo considera los que tienen CFI (formato EPUB).
    //  @keyword carga-inicial, base-de-datos, Prisma, Server-Action,
    //  getBookHighlights, CFI, separar-formato
    // ──────────────────────────────────────────────
    useEffect(() => {
        if (highlightsLoaded) return
        getBookHighlights(bookId).then((items) => {
            const epubItems: ReaderHighlight[] = []
            for (const h of items as PrismaHighlight[]) {
                if (h.cfi) {
                    epubItems.push({
                        id: h.id,
                        text: h.text,
                        color: h.color as HighlightColor,
                        pageLabel: h.pageLabel ?? null,
                        location: h.cfi,
                    })
                }
            }

            setEpubHighlights(epubItems)
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
            // epub.js emite eventos locationChanged transitorios con un
            // Location sin `start` (react-reader los convierte en "undefined").
            // Ignorar locs que no sean CFI válidos evita que EpubCFI
            // (locationFromCfi/display) explote con "not a valid argument".
            const isValidCfi =
                typeof loc === "string" && loc.startsWith("epubcfi(")
            if (!isValidCfi) {
                // react-reader llama locationChanged(href) al hacer click en un
                // item del TOC. No es un CFI: se navega directo con
                // rendition.display(), que acepta hrefs con o sin fragmento.
                // El "undefined" transitorio se sigue ignorando.
                if (loc && loc !== "undefined") {
                    const rendition = renditionRef.current
                    if (rendition) {
                        void rendition.display(loc).catch(() => {})
                    }
                }
                return
            }

            setLocation(loc)
            persistLocation(loc)
            const rendition = renditionRef.current
            try {
                const section = rendition?.book?.spine?.get(loc)
                if (section?.href) {
                    setCurrentSectionHref(section.href)
                }
            } catch {
                // sección no disponible todavía
            }
            if (navigatingToHighlightRef.current) {
                navigatingToHighlightRef.current = false
                return
            }
            if (returnTarget) {
                setReturnTarget(null)
            }
            if (
                rendition &&
                rendition.book?.locations &&
                locationsReadyRef.current
            ) {
                try {
                    const page = Number(
                        rendition.book.locations.locationFromCfi(loc)
                    )
                    if (page > 0) {
                        setEpubCurrentPage(page)
                        epubCurrentPageRef.current = page
                    }
                } catch {
                    // CFI fuera del rango de locations generadas
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

        // Detectamos dónde apoya el dedo el usuario
        rendition.on("touchstart", (event: TouchEvent) => {
            const touch = event.changedTouches?.[0] || event.touches?.[0]
            if (touch) {
                touchStartXRef.current = touch.screenX
                touchStartYRef.current = touch.screenY
            }
        })

        // Detectamos hacia dónde deslizó al levantar el dedo
        rendition.on("touchend", (event: TouchEvent) => {
            const touch = event.changedTouches?.[0] || event.touches?.[0]
            if (!touch) return

            const deltaX = touch.screenX - touchStartXRef.current
            const deltaY = touch.screenY - touchStartYRef.current

            // Si el movimiento es mayor a 50px y es más horizontal que vertical (swipe)
            if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
                if (deltaX > 0) {
                    rendition.prev() // Deslizó a la derecha -> Capítulo Anterior
                } else {
                    rendition.next() // Deslizó a la izquierda -> Capítulo Siguiente
                }
            }
        })

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
                    try {
                        const page = Number(
                            locs.locationFromCfi(locationRef.current)
                        )
                        if (page > 0) {
                            setEpubCurrentPage(page)
                            epubCurrentPageRef.current = page
                        }
                    } catch {
                        // lastLocation inválida o fuera del libro
                    }
                }
                try {
                    const current = rendition.currentLocation() as
                        | {start?: {href?: string}}
                        | undefined
                    if (current?.start?.href) {
                        setCurrentSectionHref(current.start.href)
                    }
                } catch {
                    // sección no disponible todavía
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
            body: {
                ...FLOW_CONSTRAINTS.body, // ¡CRÍTICO! Esto fusiona las reglas de scroll
                color: body,
                background
            },
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
    //  @marcar-seccion-activa Marca en el TOC del ReactReader el item de la
    //  sección que se está leyendo. react-reader no expone un prop para el
    //  item activo, así que se ubican los botones del TOC en el DOM (orden
    //  depth-first = orden de render) y se aplican estilos inline que
    //  sobreviven a re-renders. Al abrir el menú hamburguesa, hace scroll
    //  hasta el item activo para que quede visible.
    //  @keyword TOC, item-activo, seccion-actual, DOM, hamburguesa, scroll,
    //  marca-activa
    // ──────────────────────────────────────────────
    useEffect(() => {
        if (!mounted) return
        const viewer = document.querySelector(".epub-viewer")
        if (!viewer) return
        const container = viewer.firstElementChild
        if (!container) return
        const buttons = Array.from(container.querySelectorAll("button"))
        // Los primeros 3 botones del contenedor son: hamburguesa, prev y next.
        if (buttons.length < 4) return
        const tocButtons = buttons.slice(3)
        const flatToc = flattenToc(toc)
        const activeStyles = ACTIVE_TOC_STYLES[mode]

        tocButtons.forEach((button) => {
            button.style.background = ""
            button.style.color = ""
            button.style.fontWeight = ""
            button.style.borderLeft = ""
            button.style.paddingLeft = ""
        })

        let activeButton: HTMLButtonElement | null = null
        if (activeTocIndex >= 0) {
            const expectedLabel = flatToc[activeTocIndex]?.label
            const candidate = tocButtons[activeTocIndex]
            if (
                candidate &&
                expectedLabel &&
                candidate.textContent?.trim() === expectedLabel
            ) {
                activeButton = candidate
            } else if (expectedLabel) {
                // Fallback: buscar por etiqueta si el orden del DOM cambió.
                activeButton =
                    tocButtons.find((b) => b.textContent?.trim() === expectedLabel) ??
                    null
            }
        }

        if (activeButton) {
            activeButton.style.background = activeStyles.background
            activeButton.style.color = activeStyles.color
            activeButton.style.fontWeight = "600"
            activeButton.style.borderLeft = `3px solid ${activeStyles.accent}`
            activeButton.style.paddingLeft = "calc(1em - 3px)"
        }

        const hamburger = buttons[0]
        const readerArea = container.children[0] as HTMLElement | undefined
        const tocArea = container.children[1] as HTMLElement | undefined

        const onHamburgerClick = () => {
            if (!activeButton || !tocArea || !readerArea) return
            requestAnimationFrame(() => {
                // readerArea queda con transform solo cuando el TOC está expandido.
                if (readerArea.style.transform) {
                    tocArea.scrollTo({
                        top: Math.max(0, activeButton.offsetTop - tocArea.clientHeight / 2),
                        behavior: "smooth",
                    })
                }
            })
        }

        hamburger?.addEventListener("click", onHamburgerClick)
        return () => hamburger?.removeEventListener("click", onHamburgerClick)
    }, [mounted, toc, activeTocIndex, mode])

    /** @reader-styles Estilos del ReactReader fusionados con los colores del tema
     *  activo. Se recalcula con useMemo cada vez que cambia el modo de lectura.
     *  Aplica transiciones suaves en cambios de color de fondo.
     *  @keyword estilos-lector, ReactReaderStyle, contenedor, readerArea,
     *  TOC, tabla-contenidos, transicion, fondo, colores-tema */
    const readerStyles = useMemo(
        () => {
            const toc = TOC_THEMES[mode]
            const fullWidth = isMobile && settings.epubFlow === "scrolled"
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
                reader: {
                    ...ReactReaderStyle.reader,
                    top: fullWidth ? 0 : 4,
                    bottom: fullWidth ? 0 : 4,
                    ...(fullWidth ? { left: 0, right: 0, padding: 0 } : {}),
                },
                titleArea: { display: "none" },
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
        [mode, isMobile, settings.epubFlow]
    )

    // ──────────────────────────────────────────────
    //  @navegar-pagina Navega a un número de página (PageNav).
    //  Requiere que las locations del libro ya estén generadas.
    //  @keyword ir-a-pagina, PageNav, locations, cfiFromLocation
    // ──────────────────────────────────────────────
    const handleNavigate = useCallback((page: number) => {
        const rendition = renditionRef.current
        if (
            !rendition ||
            !rendition.book?.locations ||
            !locationsReadyRef.current
        ) {
            return
        }
        const cfi = rendition.book.locations.cfiFromLocation(page)
        if (cfi) {
            rendition.display(cfi)
        }
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
                            pageLabel: result.highlight!.pageLabel ?? null,
                            location: cfi,
                        },
                    ])
                }
            })
        },
        [bookId, selectionCfi, selectionText]
    )

    // ──────────────────────────────────────────────
    //  @eliminar-resaltado Elimina un resaltado de la DB (Server Action
    //  deleteHighlight) y lo remueve del estado local y de la rendition EPUB.
    //  epub.js usa el CFI (no el className) como clave para annotations.remove().
    //  @keyword eliminar-resaltado, deleteHighlight, Server-Action, anotacion,
    //  remover, CFI, annotations-remove
    // ──────────────────────────────────────────────
    const handleDeleteHighlight = useCallback((highlight: ReaderHighlight) => {
        deleteHighlight(highlight.id).then((result) => {
            if (result.success) {
                setEpubHighlights((prev) => prev.filter((h) => h.id !== highlight.id))

                const rendition = renditionRef.current
                if (rendition && highlight.location) {
                    rendition.annotations.remove(highlight.location, "highlight")
                }
            }
        })
    }, [])

    // ──────────────────────────────────────────────
    //  @navegar-resaltado-epub Navega a un resaltado EPUB por su CFI.
    //  Guarda la ubicación actual como returnTarget para que el usuario pueda
    //  volver después. Cierra la barra lateral.
    //  @keyword navegar-resaltado, CFI, rendition-display, returnTarget,
    //  barra-lateral, sidebar
    // ──────────────────────────────────────────────
    const navigateToHighlight = useCallback((highlight: ReaderHighlight) => {
        const currentLoc = locationRef.current
        setReturnTarget({epubLocation: currentLoc ?? undefined})
        const rendition = renditionRef.current
        if (rendition && highlight.location) {
            navigatingToHighlightRef.current = true
            rendition.display(highlight.location)
        }
        setSidebarOpen(false)
    }, [])

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
        }
        setReturnTarget(null)
    }, [returnTarget])

    // ──────────────────────────────────────────────
    //  @render Renderizado del componente.
    //  @keyword render, JSX, layout, header, main, sidebar, popover
    // ──────────────────────────────────────────────
    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
            <ReaderHeader
                title={title}
                currentPage={epubCurrentPage}
                totalPages={epubTotalPages}
                onNavigate={handleNavigate}
                onToggleSidebar={() => setSidebarOpen((v) => !v)}
            >
                {/** @controles-epub Controles exclusivos del EPUB: zoom de fuente
                 *  (botones +/-) y toggle de fluidez (paginado/scroll).
                 *  @keyword EPUB, zoom, fuente, fluidez, paginado, scroll */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFontSize(-10)}
                        disabled={settings.fontSize <= 75}
                        aria-label="Reducir fuente"
                    >
                        <Minus className="size-4"/>
                    </Button>
                    <span className="hidden w-10 text-center text-sm tabular-nums text-muted-foreground sm:inline"
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
                        <span className="hidden sm:inline">
                            {settings.epubFlow === "paginated" ? "Páginas" : "Desplazar"}
                        </span>
                        <span className="sm:hidden text-xs">
                            {settings.epubFlow === "paginated" ? "Pag" : "Scr"}
                        </span>
                    </Button>
                </div>
            </ReaderHeader>

            <div className="flex min-h-0 flex-1">
                <main className="relative min-h-0 flex-1">
                    {/**
                     * @estados-epub Estados de carga del lector EPUB:
                     * - Antes de montar: spinner de hidratación.
                     * - Descargando el libro: spinner de descarga.
                     * - Error de descarga: mensaje de error.
                     * - Listo: ReactReader de react-reader.
                     * @keyword estados, carga, spinner, error, ReactReader */}
                    {!mounted ? (
                        <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                            <LoaderCircle className="size-5 animate-spin"/>
                            <span>Cargando lector…</span>
                        </div>
                    ) : !epubData && !epubError ? (
                        <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                            <LoaderCircle className="size-5 animate-spin"/>
                            <span>Descargando EPUB…</span>
                        </div>
                    ) : epubError ? (
                        <div className="flex h-full items-center justify-center px-4 text-center text-destructive">
                            {epubError}
                        </div>
                    ) : (
                        <div className="epub-viewer h-full overflow-hidden relative">
                            <ReactReader
                                key={settings.epubFlow}
                                // epubData (ArrayBuffer) se abre en modo BINARY de
                                // epub.js: lee el zip desde memoria sin resolver
                                // rutas internas por URL. El cast es necesario
                                // porque el prop `url` está tipado como string.
                                url={epubData as unknown as string}
                                title={title}
                                location={location}
                                locationChanged={locationChanged}
                                tocChanged={(tocItems) => setToc(tocItems)}
                                getRendition={getRendition}
                                readerStyles={readerStyles}
                                epubOptions={{
                                    spread: "none",
                                    // En modo scroll, usamos scrolled-doc para habilitar el desborde vertical
                                    flow: settings.epubFlow === "scrolled" ? "scrolled-doc" : "paginated",
                                    // CRÍTICO: Siempre "default" para que cargue solo 1 capítulo a la vez
                                    manager: "default"
                                }}
                                // Apagamos el detector externo porque rompe el scroll; usamos el nativo del Paso 2
                                swipeable={false}
                                loadingView={
                                    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
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
                    )}

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

                {/**
                 * @barra-lateral-resaltados Barra lateral con la lista de resaltados.
                 *  @keyword sidebar, barra-lateral, resaltados, lista, navegar,
                 *  eliminar, color, pagina */}
                <HighlightSidebar
                    open={sidebarOpen}
                    highlights={epubHighlights}
                    onClose={() => setSidebarOpen(false)}
                    onNavigate={navigateToHighlight}
                    onDelete={handleDeleteHighlight}
                />
            </div>

            {/**
             * @popover-resaltado Popover de selección de color para resaltar texto.
             *  Solo visible cuando hay una selección activa (popover no nulo).
             *  Delega en HighlightPopover la UI de botones de color.
             *  @keyword popover, seleccion-color, HighlightPopover, onClose */}
            {popover && (
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