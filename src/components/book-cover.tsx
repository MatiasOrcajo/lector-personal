"use client"

import { useEffect, useRef, useState } from "react"
import { BookOpen } from "lucide-react"
import { uploadCover } from "@/app/actions/cover"
import { extractEpubCover, renderPdfCover } from "@/lib/covers"

export type BookCoverProps = {
  id: string
  title: string
  format: string
  coverUrl: string | null
  blobUrl: string
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
        const response = await fetch(`/api/file?url=${encodeURIComponent(blobUrl)}`)
        if (!response.ok) return
        const data = await response.arrayBuffer()

        const dataUrl =
          format.toLowerCase() === "pdf"
            ? await renderPdfCover(data)
            : format.toLowerCase() === "epub"
              ? await extractEpubCover(data)
              : null

        if (!dataUrl) return

        setCover(dataUrl)
        void uploadCover(id, dataUrl)
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
