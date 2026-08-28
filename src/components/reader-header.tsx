"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft, Highlighter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { PageNav } from "@/components/page-nav"

/** @reader-header-props Props del header compartido.
 *  @keyword props, titulo, navegacion, sidebar, controles */
type ReaderHeaderProps = {
    title: string
    currentPage: number
    totalPages: number | null
    onNavigate: (page: number) => void
    onToggleSidebar: () => void
    children?: ReactNode
}

/** @reader-header Barra superior compartida por ambos visores.
 *  Botón Volver, título del libro, navegación de páginas (PageNav),
 *  botón de resaltados (sidebar) y ThemeToggle. El slot `children` permite
 *  que cada visor inyecte sus controles exclusivos (fuente/fluidez en EPUB,
 *  zoom en PDF) sin acoplar el header a un formato.
 *  @keyword header, barra-superior, compartido, Volver, titulo, ThemeToggle,
 *  resaltados, slot */
export function ReaderHeader({
    title,
    currentPage,
    totalPages,
    onNavigate,
    onToggleSidebar,
    children,
}: ReaderHeaderProps) {
    return (
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-background/95 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
            <Link href="/">
                <Button variant="outline" size="sm" aria-label="Volver">
                    <ArrowLeft/>
                    <span className="hidden sm:inline">Volver</span>
                </Button>
            </Link>
            <h1 className="min-w-0 flex-1 truncate text-xs font-medium sm:text-base">
                {title}
            </h1>
            <PageNav
                currentPage={currentPage}
                totalPages={totalPages}
                onNavigate={onNavigate}
            />
            {children}
            <Button
                variant="outline"
                size="sm"
                onClick={onToggleSidebar}
                aria-label="Resaltados"
            >
                <Highlighter className="size-4"/>
                <span className="hidden sm:inline">Resaltados</span>
            </Button>
            <ThemeToggle/>
        </header>
    )
}