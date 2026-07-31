export type ReaderMode = "light" | "dark" | "sepia"
export type EpubFlow = "paginated" | "scrolled"
export type PdfZoomMode = "fit-width" | "fit-page" | "custom"

export type ViewerSettings = {
  fontSize: number
  epubFlow: EpubFlow
  pdfZoomMode: PdfZoomMode
  pdfZoom: number
}

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = {
  fontSize: 100,
  epubFlow: "paginated",
  pdfZoomMode: "fit-width",
  pdfZoom: 1,
}

const STORAGE_KEY = "viewer-settings"

export function loadViewerSettings(): ViewerSettings {
  if (typeof window === "undefined") {
    return DEFAULT_VIEWER_SETTINGS
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VIEWER_SETTINGS
    return {
      ...DEFAULT_VIEWER_SETTINGS,
      ...(JSON.parse(raw) as Partial<ViewerSettings>),
    }
  } catch {
    return DEFAULT_VIEWER_SETTINGS
  }
}

export function saveViewerSettings(settings: ViewerSettings) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore quota / privacy errors
  }
}

export function parsePdfPage(location: string | null): number | null {
  if (!location) return null
  const match = /^page:(\d+)$/.exec(location)
  if (!match) return null
  return Number(match[1])
}
