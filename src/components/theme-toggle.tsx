"use client"

import { useState, useEffect } from "react"
import { Moon, Sun, Sunset } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useThemeMode } from "@/components/theme-provider"
import type { ReaderMode } from "@/lib/viewer-settings"
import { cn } from "@/lib/utils"

const MODES: { value: ReaderMode; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Oscuro", icon: Moon },
    { value: "sepia", label: "Intermedio", icon: Sunset },
]

type ThemeToggleProps = {
    /** "segmented": los tres modos visibles. "cycle": un único botón que
     *  rota entre modos (para barras estrechas en mobile). "responsive":
     *  cycle en mobile y segmented desde sm. */
    variant?: "segmented" | "cycle" | "responsive"
    className?: string
}

export function ThemeToggle({ variant = "segmented", className }: ThemeToggleProps) {
    const [mounted, setMounted] = useState(false)
    const { mode, setMode } = useThemeMode()

    // Evita el error de hidratación renderizando un estado neutral primero
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true)
    }, [])

    const activeMode: ReaderMode | null = mounted ? mode : null

    const segmented = (
        <div
            className={cn(
                "flex items-center rounded-lg border p-0.5",
                variant === "responsive" && "hidden sm:flex",
                variant !== "responsive" && className
            )}
            role="group"
            aria-label="Tema"
        >
            {MODES.map(({ value, label, icon: Icon }) => (
                <Button
                    key={value}
                    size="sm"
                    variant={activeMode === value ? "secondary" : "ghost"}
                    className="h-7 gap-1"
                    onClick={() => setMode(value)}
                    aria-pressed={activeMode === value}
                    title={label}
                >
                    <Icon className="size-3.5" />
                    <span className="hidden md:inline">{label}</span>
                </Button>
            ))}
        </div>
    )

    const currentIndex = Math.max(0, MODES.findIndex((m) => m.value === activeMode))
    const current = MODES[currentIndex]
    const next = MODES[(currentIndex + 1) % MODES.length]
    const CurrentIcon = current.icon

    const cycle = (
        <Button
            size="icon-sm"
            variant="outline"
            className={cn(variant === "responsive" && "sm:hidden", variant !== "responsive" && className)}
            onClick={() => setMode(next.value)}
            aria-label={`Tema: ${current.label}. Cambiar a ${next.label}`}
        >
            <CurrentIcon className="size-4" />
        </Button>
    )

    if (variant === "segmented") return segmented
    if (variant === "cycle") return cycle
    return (
        <div className={cn("contents", className)}>
            {cycle}
            {segmented}
        </div>
    )
}
