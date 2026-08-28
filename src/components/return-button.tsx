"use client"

import { Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"

/** @return-button-props Props del botón de retorno.
 *  @keyword props, visible, volver */
type ReturnButtonProps = {
    visible: boolean
    onReturn: () => void
}

/** @return-button Botón flotante "Volver a la página anterior" compartido
 *  por ambos visores. Se muestra cuando el usuario navegó a un resaltado
 *  desde otra posición (returnTarget) y permite restaurarla.
 *  @keyword boton-retorno, volver, pagina-anterior, Undo2, flotante,
 *  compartido, EPUB, PDF */
export function ReturnButton({ visible, onReturn }: ReturnButtonProps) {
    if (!visible) return null
    return (
        <div className="absolute bottom-6 left-1/2 z-40 -translate-x-1/2">
            <Button
                variant="default"
                size="sm"
                className="shadow-lg"
                onClick={onReturn}
            >
                <Undo2 className="size-4"/>
                <span className="hidden sm:inline">Volver a la página anterior</span>
                <span className="sm:hidden">Volver</span>
            </Button>
        </div>
    )
}