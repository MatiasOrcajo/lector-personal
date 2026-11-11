"use client"

import { useEffect, useRef, useState } from "react"
import { BookOpen } from "lucide-react"
import { uploadCover } from "@/app/actions/cover"
// "@/lib/covers" se importa dinámicamente: importa pdf.js, que al evaluarse
// en el servidor lanza "DOMMatrix is not defined" y rompía el SSR de toda la
// biblioteca (React terminaba renderizando en el cliente).

export type BookCoverProps = {
  id: string
  title: string
  format: string
  coverUrl: string | null
  blobUrl: string
}

/** Limita cuántas portadas se generan a la vez. Cada una descarga el libro
 *  completo (hasta 50 MB): con muchos libros sin portada, la biblioteca
 *  disparaba todas las descargas en paralelo y saturaba la red (sobre todo
 *  en mobile). */
const MAX_CONCURRENT_COVERS = 2
let activeCovers = 0
const coverQueue: (() => void)[] = []
const pendingCovers = new Map<string, Promise<string | null>>()

async function withCoverSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeCovers >= MAX_CONCURRENT_COVERS) {
    await new Promise<void>((resolve) => coverQueue.push(resolve))
  }
  activeCovers++
  try {
    return await task()
  } finally {
    activeCovers--
    coverQueue.shift()?.()
  }
}

export function BookCover({ id, title, format, coverUrl, blobUrl }: BookCoverProps) {
  const [cover, setCover] = useState<string | null>(() =>
    coverUrl ? `/api/cover/${id}` : null
  )
  const [failed, setFailed] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (coverUrl || startedRef.current) return
    startedRef.current = true

    async function generate() {
      try {
        // El mismo libro puede aparecer dos veces (grilla + "Resaltados
        // recientes"): se comparte una sola generación por id.
        let pending = pendingCovers.get(id)
        if (!pending) {
          pending = withCoverSlot(async () => {
            const response = await fetch(`/api/file?url=${encodeURIComponent(blobUrl)}`)
            if (!response.ok) return null
            const data = await response.arrayBuffer()
            const { renderPdfCover, extractEpubCover } = await import("@/lib/covers")

            return format.toLowerCase() === "pdf"
              ? await renderPdfCover(data)
              : format.toLowerCase() === "epub"
                ? await extractEpubCover(data)
                : null
          }).then((url) => {
            if (url) void uploadCover(id, url)
            return url
          })
          pendingCovers.set(id, pending)
        }
        const dataUrl = await pending

        if (!dataUrl) return

        setCover(dataUrl)
      } catch {
        setFailed(true)
      }
    }

    void generate()
  }, [id, format, coverUrl, blobUrl])

  if (failed || !cover) {
    return (
      <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 bg-muted/50 text-muted-foreground">
        <BookOpen className="size-8" />
        <span className="max-w-full truncate px-2 text-xs">{title}</span>
      </div>
    )
  }

  return (
    <div className="aspect-[3/4] overflow-hidden bg-muted/50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover}
        alt={`Portada de ${title}`}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
