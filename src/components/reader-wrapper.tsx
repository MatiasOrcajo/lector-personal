"use client"

import dynamic from "next/dynamic"
import {LoaderCircle} from "lucide-react"
import {EpubReader} from "@/components/epub-reader"
import type {PdfViewerProps} from "@/components/pdf-viewer"

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

/** @wrapper-props Props del ReaderWrapper.
 *  @keyword props, url, formato, libro, ubicacion-inicial */
type ReaderWrapperProps = {
    url: string
    format: string
    title: string
    bookId: string
    initialLocation: string | null
}

/** @reader-wrapper Shell del lector de libros.
 *  Decide qué visor renderizar según el formato y delega el resto:
 *  EPUB → EpubReader, PDF → PdfViewer. No comparte estado entre visores:
 *  cada uno maneja su header, navegación, progreso, resaltados y sidebar.
 *  @keyword lector, shell, switch-formato, EPUB, PDF */
export function ReaderWrapper({
                                  url,
                                  format,
                                  title,
                                  bookId,
                                  initialLocation,
                              }: ReaderWrapperProps) {

    /** @proxied-url URL del archivo servida a través del proxy interno de Next.js
     *  para evitar problemas de CORS con Blob Storage.
     *  @keyword proxy, API-route, CORS, blob-url */
    const proxiedUrl = `/api/file?url=${encodeURIComponent(url)}`

    const fmt = format.toLowerCase()

    if (fmt === "epub") {
        return (
            <EpubReader
                url={proxiedUrl}
                title={title}
                bookId={bookId}
                initialLocation={initialLocation}
            />
        )
    }

    if (fmt === "pdf") {
        return (
            <PdfViewer
                url={proxiedUrl}
                title={title}
                bookId={bookId}
                initialLocation={initialLocation}
            />
        )
    }

    return (
        <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
            Formato no soportado: {format}
        </div>
    )
}