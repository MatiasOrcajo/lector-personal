"use client"

import { useCallback, useEffect, useRef } from "react"
import { X } from "lucide-react"
import type { HighlightColor } from "@/app/actions/highlights"

const COLORS: { color: HighlightColor; hex: string; ring: string }[] = [
  { color: "yellow", hex: "#fef08a", ring: "ring-yellow-400" },
  { color: "green", hex: "#bbf7d0", ring: "ring-green-400" },
  { color: "blue", hex: "#bfdbfe", ring: "ring-blue-400" },
  { color: "pink", hex: "#fbcfe8", ring: "ring-pink-400" },
  { color: "orange", hex: "#fed7aa", ring: "ring-orange-400" },
]

type HighlightPopoverProps = {
  x: number
  y: number
  onSelect: (color: HighlightColor) => void
  onClose: () => void
}

export function HighlightPopover({ x, y, onSelect, onClose }: HighlightPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
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

  const popoverWidth = 200
  const adjustedX = Math.min(x, window.innerWidth - popoverWidth - 8)
  const adjustedY = y - 48

  return (
    <div
      ref={ref}
      className="fixed z-50 flex items-center gap-1 rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur-xs"
      style={{ left: Math.max(adjustedX, 4), top: Math.max(adjustedY, 4) }}
      role="tooltip"
    >
      {COLORS.map(({ color, hex, ring }) => (
        <button
          key={color}
          type="button"
          className={`size-7 cursor-pointer rounded-full border-2 border-transparent transition-all hover:scale-110 focus:outline-hidden focus-visible:ring-2 ${ring}`}
          style={{ backgroundColor: hex }}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(color)
          }}
          aria-label={`Resaltar en ${color}`}
        />
      ))}
      <div className="mx-0.5 h-5 w-px bg-border" />
      <button
        type="button"
        className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
