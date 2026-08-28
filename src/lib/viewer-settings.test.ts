import { describe, expect, it, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import {
  DEFAULT_VIEWER_SETTINGS,
  loadViewerSettings,
  parsePdfPage,
  useEpubViewerSettings,
  usePdfViewerSettings,
} from "./viewer-settings"

const STORAGE_KEY = "viewer-settings"

describe("parsePdfPage", () => {
  it("parses a valid page location", () => {
    expect(parsePdfPage("page:12")).toBe(12)
    expect(parsePdfPage("page:1")).toBe(1)
  })

  it("returns null for invalid input", () => {
    expect(parsePdfPage(null)).toBeNull()
    expect(parsePdfPage("")).toBeNull()
    expect(parsePdfPage("epubcfi(/6/2)")).toBeNull()
    expect(parsePdfPage("page:abc")).toBeNull()
    expect(parsePdfPage("page:")).toBeNull()
  })
})

describe("loadViewerSettings", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("returns defaults when nothing is stored", () => {
    expect(loadViewerSettings()).toEqual(DEFAULT_VIEWER_SETTINGS)
  })

  it("merges partial stored settings over the defaults", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: 150 }))
    const loaded = loadViewerSettings()
    expect(loaded.fontSize).toBe(150)
    expect(loaded.epubFlow).toBe("paginated")
    expect(loaded.pdfZoom).toBe(1)
  })

  it("falls back to defaults on corrupted storage", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadViewerSettings()).toEqual(DEFAULT_VIEWER_SETTINGS)
  })
})

describe("useEpubViewerSettings", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("initializes from the stored slice", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fontSize: 125, epubFlow: "scrolled" })
    )
    const { result } = renderHook(() => useEpubViewerSettings())
    expect(result.current.settings.fontSize).toBe(125)
    expect(result.current.settings.epubFlow).toBe("scrolled")
  })

  it("clamps fontSize between 75 and 175 in steps of 10", () => {
    const { result } = renderHook(() => useEpubViewerSettings())
    act(() => result.current.setFontSize(-100))
    expect(result.current.settings.fontSize).toBe(75)
    act(() => result.current.setFontSize(1000))
    expect(result.current.settings.fontSize).toBe(175)
    act(() => result.current.setFontSize(-10))
    expect(result.current.settings.fontSize).toBe(165)
  })

  it("toggles the flow between paginated and scrolled", () => {
    const { result } = renderHook(() => useEpubViewerSettings())
    expect(result.current.settings.epubFlow).toBe("paginated")
    act(() => result.current.toggleFlow())
    expect(result.current.settings.epubFlow).toBe("scrolled")
    act(() => result.current.toggleFlow())
    expect(result.current.settings.epubFlow).toBe("paginated")
  })

  it("persists only its slice without clobbering the pdf slice", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pdfZoomMode: "custom", pdfZoom: 1.5 })
    )
    const { result } = renderHook(() => useEpubViewerSettings())
    act(() => result.current.setFontSize(10))
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
    expect(stored.fontSize).toBe(110)
    expect(stored.pdfZoomMode).toBe("custom")
    expect(stored.pdfZoom).toBe(1.5)
  })
})

describe("usePdfViewerSettings", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("initializes from the stored slice", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pdfZoomMode: "fit-page", pdfZoom: 2 })
    )
    const { result } = renderHook(() => usePdfViewerSettings())
    expect(result.current.zoomMode).toBe("fit-page")
    expect(result.current.zoom).toBe(2)
  })

  it("persists only its slice without clobbering the epub slice", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fontSize: 150, epubFlow: "scrolled" })
    )
    const { result } = renderHook(() => usePdfViewerSettings())
    act(() => result.current.setZoom(0.75))
    act(() => result.current.setZoomMode("custom"))
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
    expect(stored.pdfZoom).toBe(0.75)
    expect(stored.pdfZoomMode).toBe("custom")
    expect(stored.fontSize).toBe(150)
    expect(stored.epubFlow).toBe("scrolled")
  })
})