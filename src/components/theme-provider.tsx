"use client"

import { createContext, useContext, useEffect, useState } from "react"
import type { ReaderMode } from "@/lib/viewer-settings"

const STORAGE_KEY = "theme"

type ThemeContextValue = {
  mode: ReaderMode
  setMode: (mode: ReaderMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getInitialMode(): ReaderMode {
  if (typeof window === "undefined") return "light"
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === "dark" || stored === "sepia") return stored
  if (
    stored === null &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark"
  }
  return "light"
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ReaderMode>(() => getInitialMode())

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("dark", "sepia")
    if (mode !== "light") {
      root.classList.add(mode)
    }
    window.localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useThemeMode must be used within a ThemeProvider")
  }
  return ctx
}
