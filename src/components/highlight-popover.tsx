"use client"

import { useCallback, useEffect, useRef } from "react"
import { X } from "lucide-react"
import type { HighlightColor } from "@/app/actions/highlights"

const COLORS: { color: HighlightColor; label: string; hex: string; ring: string }[] = [
  { color: "yellow", label: "amarillo", hex: "#fef08a", ring: "ring-yellow-400" },
  { color: "green", label: "verde", hex: "#bbf7d0", ring: "ring-green-400" },
  { color: "blue", label: "azul", hex: "#bfdbfe", ring: "ring-blue-400" },
  { color: "pink", label: "rosa", hex: "#fbcfe8", ring: "ring-pink-400" },
  { color: "orange", label: "naranja", hex: "#fed7aa", ring: "ring-orange-400" },
]

const POPOVER_WIDTH = 230
const POPOVER_HEIGHT = 48
const GAP = 8

type HighlightPopoverProps = {
  /** Centro horizontal de la selección (coordenadas de viewport). */
  x: number
  /** Borde superior de la selección. */
  y: number
  /** Borde inferior de la selección. Si se pasa, el popover puede ubicarse
   *  debajo cuando no entra arriba o en pantallas táctiles (donde arriba
   *  aparece el menú nativo de copiar/pegar y lo tapaba). */
  bottom?: number
  onSelect: (color: HighlightColor) => void
  onClose: () => void
}

function isCoarsePointer(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches
  } catch {
    return false
  }
}

export function HighlightPopover({ x, y, bottom, onSelect, onClose }: HighlightPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [handleClickOutside, onClose])

  // x es el centro de la selección: se centra el popover y se mantiene
  // dentro del viewport (antes el borde izquierdo quedaba en el centro).
  const left = Math.min(
    Math.max(x - POPOVER_WIDTH / 2, GAP),
    Math.max(GAP, window.innerWidth - POPOVER_WIDTH - GAP)
  )

  const above = y - POPOVER_HEIGHT - GAP
  const below = bottom !== undefined ? bottom + GAP : null
  const fitsBelow =
    below !== null && below + POPOVER_HEIGHT <= window.innerHeight - GAP
  const placeBelow =
    fitsBelow && (above < GAP || isCoarsePointer())
  const top = placeBelow && below !== null ? below : Math.max(above, GAP)

  return (
    <div
      ref={ref}
      className="fixed z-50 flex items-center gap-1.5 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur-xs"
      style={{ left, top }}
      role="toolbar"
      aria-label="Resaltar selección"
    >
      {COLORS.map(({ color, label, hex, ring }) => (
        <button
          key={color}
          type="button"
          className={`size-8 cursor-pointer rounded-full border-2 border-black/10 transition-all hover:scale-110 focus:outline-hidden focus-visible:ring-2 sm:size-7 ${ring}`}
          style={{ backgroundColor: hex }}
          // Evita que el mousedown/touch sobre el botón colapse la selección
          // antes del click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(color)
          }}
          aria-label={`Resaltar en ${label}`}
          title={`Resaltar en ${label}`}
        />
      ))}
      <div className="mx-0.5 h-5 w-px bg-border" />
      <button
        type="button"
        className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:size-7"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Cerrar"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
