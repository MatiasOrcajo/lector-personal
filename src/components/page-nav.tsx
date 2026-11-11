"use client"

import { useCallback, useState, type KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

/** @page-nav-props Props del control de navegación de páginas.
 *  Es presentacional: recibe la página actual/total y delega la navegación
 *  en el visor activo mediante onNavigate(page).
 *  @keyword props, pagina-actual, total, navegar */
type PageNavProps = {
    currentPage: number
    totalPages: number | null
    onNavigate: (page: number) => void
}

/** @page-nav Navegación de páginas compartida por ambos visores.
 *  Input numérico editable (Enter/blur para navegar), botones anterior y
 *  siguiente y contador total. La lógica de validación es común; cada visor
 *  implementa su propia navegación vía onNavigate.
 *  @keyword navegacion, input-pagina, anterior, siguiente, contador,
 *  compartido, EPUB, PDF */
export function PageNav({ currentPage, totalPages, onNavigate }: PageNavProps) {
    const [pageInput, setPageInput] = useState("1")
    const [isEditingPage, setIsEditingPage] = useState(false)

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.currentTarget.blur()
        }
    }, [])

    const handleBlur = useCallback(() => {
        setIsEditingPage(false)
        const parsed = parseInt(pageInput, 10)
        if (
            !isNaN(parsed) &&
            parsed >= 1 &&
            parsed <= (totalPages ?? 1) &&
            parsed !== currentPage
        ) {
            onNavigate(parsed)
        } else {
            setPageInput(String(currentPage))
        }
    }, [pageInput, totalPages, currentPage, onNavigate])

    const handleFocus = useCallback(() => {
        setIsEditingPage(true)
        setPageInput(String(currentPage))
    }, [currentPage])

    return (
        <div className="flex items-center gap-1.5">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate(currentPage - 1)}
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
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                // text-base en mobile: iOS hace zoom automático al enfocar
                // inputs con fuente menor a 16px.
                className="h-7 w-12 rounded-md border border-input bg-background text-center text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
                aria-label="Ir a página"
            />
            <span className="text-xs tabular-nums text-muted-foreground sm:text-sm">
                / {totalPages ?? "—"}
            </span>
            <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate(currentPage + 1)}
                disabled={totalPages !== null && currentPage >= totalPages}
                aria-label="Página siguiente"
            >
                <ChevronRight className="size-4"/>
            </Button>
        </div>
    )
}