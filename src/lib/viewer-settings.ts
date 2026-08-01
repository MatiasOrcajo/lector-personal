export type ReaderMode = "light" | "dark" | "sepia"
export type EpubFlow = "paginated" | "scrolled"
export type PdfZoomMode = "fit-width" | "fit-page" | "custom"
export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "orange"

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

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: "rgba(254, 240, 138, 0.5)",
  green: "rgba(187, 247, 208, 0.5)",
  blue: "rgba(191, 219, 254, 0.5)",
  pink: "rgba(251, 207, 232, 0.5)",
  orange: "rgba(254, 215, 170, 0.5)",
}

const SEPIA_HIGHLIGHT_OVERRIDES: Partial<Record<HighlightColor, string>> = {
  yellow: "rgba(200, 155, 40, 0.55)",
}

export function getEffectiveHighlightColor(
  color: HighlightColor,
  mode: ReaderMode
): string {
  if (mode === "sepia" && SEPIA_HIGHLIGHT_OVERRIDES[color]) {
    return SEPIA_HIGHLIGHT_OVERRIDES[color]!
  }
  return HIGHLIGHT_COLORS[color]
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
