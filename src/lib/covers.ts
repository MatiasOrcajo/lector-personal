"use client"

import { unzipSync } from "fflate"
import { pdfjs } from "react-pdf"

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

const COVER_JPEG_QUALITY = 0.85
const COVER_PDF_SCALE = 1.6

export async function renderPdfCover(data: ArrayBuffer): Promise<string> {
  const doc = await pdfjs.getDocument({ data }).promise
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: COVER_PDF_SCALE })
  const canvas = document.createElement("canvas")
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvas, viewport }).promise
  return canvas.toDataURL("image/jpeg", COVER_JPEG_QUALITY)
}

function joinPath(dir: string, href: string): string {
  const segments = href.split("/").filter(Boolean)
  const out: string[] = dir.split("/").filter(Boolean)
  for (const segment of segments) {
    if (segment === ".") continue
    if (segment === "..") {
      out.pop()
    } else {
      out.push(segment)
    }
  }
  return out.join("/")
}

export async function extractEpubCover(
  data: ArrayBuffer
): Promise<string | null> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(data))
  } catch {
    return null
  }

  const decoder = new TextDecoder()
  const container = files["META-INF/container.xml"]
  if (!container) return null

  const containerDoc = new DOMParser().parseFromString(
    decoder.decode(container),
    "application/xml"
  )
  const rootfile = containerDoc.querySelector("rootfile")?.getAttribute("full-path")
  if (!rootfile) return null

  const opfPath = joinPath("", rootfile)
  const opf = files[opfPath]
  if (!opf) return null

  const opfDoc = new DOMParser().parseFromString(
    decoder.decode(opf),
    "application/xml"
  )
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : ""

  const items = Array.from(opfDoc.getElementsByTagName("item"))
  const coverItem =
    items.find((item) =>
      (item.getAttribute("properties") ?? "").split(/\s+/).includes("cover-image")
    ) ??
    items.find((item) => /^cover(-image)?$/i.test(item.getAttribute("id") ?? "")) ??
    items.find(
      (item) =>
        /cover/i.test(item.getAttribute("href") ?? "") &&
        (item.getAttribute("media-type") ?? "").startsWith("image/")
    )

  if (!coverItem) return null

  const href = coverItem.getAttribute("href")
  if (!href) return null

  const entryPath = joinPath(opfDir, href)
  const bytes = files[entryPath]
  if (!bytes) return null

  const mime = coverItem.getAttribute("media-type") ?? "image/jpeg"
  const blob = new Blob([new Uint8Array(bytes)], { type: mime })
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
