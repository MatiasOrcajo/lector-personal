"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { deleteHighlight } from "@/app/actions/highlights"
import type { HighlightColor } from "@/app/actions/highlights"
import { BookOpen, Trash2, Highlighter } from "lucide-react"

const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: "#fef08a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
  orange: "#fed7aa",
}

type HighlightItem = {
  id: string
  text: string
  color: HighlightColor
  createdAt: Date
  book: {
    id: string
    title: string
    displayTitle: string | null
    format: string
  }
}

type HighlightsSectionProps = {
  highlights: HighlightItem[]
}

export function HighlightsSection({ highlights: initialHighlights }: HighlightsSectionProps) {
  const [highlights, setHighlights] = useState(initialHighlights)
  const [isPending, startTransition] = useTransition()

  function handleDelete(highlightId: string) {
    startTransition(async () => {
      const result = await deleteHighlight(highlightId)
      if (result.success) {
        setHighlights((prev) => prev.filter((h) => h.id !== highlightId))
      }
    })
  }

  if (highlights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Highlighter className="size-12 text-muted-foreground/40" />
        <p className="mt-4 text-lg text-muted-foreground">
          No tienes resaltados
        </p>
        <p className="text-sm text-muted-foreground/60">
          Abre un libro, selecciona texto y elige un color para empezar
        </p>
      </div>
    )
  }

  const grouped = new Map<string, HighlightItem[]>()
  for (const h of highlights) {
    const bookId = h.book.id
    if (!grouped.has(bookId)) {
      grouped.set(bookId, [])
    }
    grouped.get(bookId)!.push(h)
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([bookId, items]) => {
        const book = items[0].book
        const bookTitle = book.displayTitle ?? book.title
        return (
          <div key={bookId} className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="size-4 text-muted-foreground" />
              <Link
                href={`/read/${bookId}`}
                className="text-sm font-medium hover:underline"
              >
                {bookTitle}
              </Link>
              <span className="text-xs uppercase text-muted-foreground">
                {book.format}
              </span>
            </div>
            <ul className="space-y-2">
              {items.map((h) => (
                <li
                  key={h.id}
                  className="flex items-start gap-2 rounded-md p-2 transition-colors hover:bg-muted/50"
                >
                  <span
                    className="mt-0.5 block size-4 shrink-0 rounded-sm border"
                    style={{ backgroundColor: HIGHLIGHT_COLORS[h.color] }}
                    aria-hidden="true"
                  />
                  <p className="min-w-0 flex-1 text-sm leading-relaxed">
                    &ldquo;{h.text.length > 150 ? h.text.slice(0, 150) + "…" : h.text}&rdquo;
                  </p>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(h.id)}
                    disabled={isPending}
                    aria-label="Eliminar resaltado"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
