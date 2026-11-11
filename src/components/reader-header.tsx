"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft, Highlighter } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
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
 *  Layout: en desktop todo en una fila; en mobile la primera fila tiene
 *  volver / título / resaltados / tema y la segunda la navegación y los
 *  controles del visor (antes se apilaban en 2-3 filas desordenadas).
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
        <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b bg-background/95 px-2 py-1.5 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-3">
            <Link
                href="/"
                aria-label="Volver"
                className={buttonVariants({ variant: "outline", size: "sm", className: "order-1" })}
            >
                <ArrowLeft/>
                <span className="hidden sm:inline">Volver</span>
            </Link>
            <h1
                className="order-2 min-w-0 flex-1 truncate text-sm font-medium sm:text-base"
                title={title}
            >
                {title}
            </h1>
            <div className="order-5 flex w-full items-center justify-between gap-2 sm:order-3 sm:w-auto sm:justify-start sm:gap-3">
                <PageNav
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onNavigate={onNavigate}
                />
                {children}
            </div>
            <Button
                variant="outline"
                size="sm"
                onClick={onToggleSidebar}
                aria-label="Resaltados"
                className="order-3 sm:order-4"
            >
                <Highlighter className="size-4"/>
                <span className="hidden sm:inline">Resaltados</span>
            </Button>
            <div className="order-4 flex sm:order-5">
                <ThemeToggle variant="responsive"/>
            </div>
        </header>
    )
}
