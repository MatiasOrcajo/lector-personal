"use client"

import { Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HIGHLIGHT_COLORS } from "@/lib/viewer-settings"
import type { ReaderHighlight } from "@/lib/reader-types"

/** @sidebar-props Props de la barra lateral de resaltados.
 *  @keyword props, resaltados, abrir, cerrar, navegar, eliminar */
type HighlightSidebarProps = {
    open: boolean
    highlights: ReaderHighlight[]
    onClose: () => void
    onNavigate: (highlight: ReaderHighlight) => void
    onDelete: (highlight: ReaderHighlight) => void
}

/** @highlight-sidebar Barra lateral de resaltados compartida por ambos
 *  visores. Trabaja sobre ReaderHighlight (agnóstico del formato): el click
 *  navega al resaltado y el botón trash lo elimina. La interpretación de
 *  `location` (CFI o "page:N") la hace cada visor vía los callbacks.
 *  @keyword sidebar, barra-lateral, resaltados, lista, navegar, eliminar,
 *  color, pagina, compartido, EPUB, PDF */
export function HighlightSidebar({
    open,
    highlights,
    onClose,
    onNavigate,
    onDelete,
}: HighlightSidebarProps) {
    if (!open) return null

    return (
        <>
            <div
                className="fixed inset-0 z-40 bg-black/40 sm:hidden"
                onClick={onClose}
                aria-hidden="true"
            />
            <aside className="fixed inset-y-0 right-0 z-50 flex w-full shrink-0 flex-col border-l bg-background sm:relative sm:w-72">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <h2 className="text-sm font-medium">Mis Resaltados</h2>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={onClose}
                        aria-label="Cerrar barra lateral"
                    >
                        <X className="size-4"/>
                    </Button>
                </div>
                <div className="flex-1 overflow-auto">
                    {highlights.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">
                            No hay resaltados. Selecciona texto y elige un color.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {highlights.map((h) => (
                                <li key={h.id} className="px-4 py-3">
                                    <button
                                        type="button"
                                        className="mb-1.5 w-full text-left text-sm leading-relaxed cursor-pointer"
                                        onClick={() => h.location && onNavigate(h)}
                                    >
                                        <span
                                            className="rounded-sm px-1"
                                            style={{backgroundColor: HIGHLIGHT_COLORS[h.color]}}
                                        >
                                            {h.text.length > 120
                                                ? h.text.slice(0, 120) + "…"
                                                : h.text}
                                        </span>
                                        {h.pageLabel ? (
                                            <span className="mt-1 block text-xs text-muted-foreground">
                                                {h.pageLabel}
                                            </span>
                                        ) : null}
                                    </button>
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        className="size-6 text-muted-foreground hover:text-destructive"
                                        onClick={() => onDelete(h)}
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
        </>
    )
}