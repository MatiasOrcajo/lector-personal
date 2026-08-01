"use client"

import { useState, useEffect } from "react"
import { Moon, Sun, Sunset } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useThemeMode } from "@/components/theme-provider"
import type { ReaderMode } from "@/lib/viewer-settings"

const MODES: { value: ReaderMode; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Oscuro", icon: Moon },
    { value: "sepia", label: "Intermedio", icon: Sunset },
]

export function ThemeToggle() {
    const [mounted, setMounted] = useState(false)
    const { mode, setMode } = useThemeMode()

    // Evita el error de hidratación renderizando un estado neutral primero
    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return (
            <div className="flex items-center rounded-lg border p-0.5">
                {MODES.map(({ value, label, icon: Icon }) => (
                    <Button
                        key={value}
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1"
                        title={label}
                    >
                        <Icon className="size-3.5" />
                        <span className="hidden sm:inline">{label}</span>
                    </Button>
                ))}
            </div>
        )
    }

    return (
        <div className="flex items-center rounded-lg border p-0.5">
            {MODES.map(({ value, label, icon: Icon }) => (
                <Button
                    key={value}
                    size="sm"
                    variant={mode === value ? "secondary" : "ghost"}
                    className="h-7 gap-1"
                    onClick={() => setMode(value)}
                    aria-pressed={mode === value}
                    title={label}
                >
                    <Icon className="size-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                </Button>
            ))}
        </div>
    )
}