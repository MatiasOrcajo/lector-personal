import type { HighlightColor } from "@/lib/viewer-settings"

/** @reader-highlight Item de resaltado unificado para la barra lateral.
 *  El campo `location` es una cadena opaca que cada visor interpreta:
 *  - EPUB: un CFI (epubcfi(...)).
 *  - PDF: "page:N".
 *  Esto permite que la UI compartida (sidebar) sea agnóstica del formato.
 *  @keyword tipo, resaltado, unificado, sidebar, CFI, page */
export type ReaderHighlight = {
    id: string
    text: string
    color: HighlightColor
    pageLabel: string | null
    location: string
}