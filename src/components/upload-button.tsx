"use client"

import { useState, useRef, useEffect } from "react"
import { Upload } from "lucide-react"
import { upload } from "@vercel/blob/client"
import { useRouter } from "next/navigation"
import { saveUploadedBook } from "@/app/actions/upload"
import { Button } from "@/components/ui/button"

const MAX_FILE_BYTES = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = ["pdf", "epub"]

/** `folderId`: carpeta que se está viendo. El libro se sube ahí (antes
 *  siempre caía en la raíz y había que moverlo a mano). */
export function UploadButton({ folderId }: { folderId?: string | null }) {
  const router = useRouter()
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
  }, [])

  const loading = progress !== null

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ""
    if (!file) return

    setError(null)
    setSuccess(false)

    const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError("Solo se permiten archivos PDF o EPUB.")
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("El archivo supera el máximo de 50 MB.")
      return
    }

    setProgress(0)
    try {
      const blob = await upload(file.name, file, {
        access: "private",
        handleUploadUrl: "/api/upload",
        multipart: file.size > 5 * 1024 * 1024,
        contentType: extension === "pdf" ? "application/pdf" : "application/epub+zip",
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      })

      const result = await saveUploadedBook({
        blobUrl: blob.url,
        title: file.name,
        format: extension,
        folderId,
      })

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        router.refresh()
        successTimerRef.current = setTimeout(() => setSuccess(false), 3000)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : ""
      setError(
        /network|fetch/i.test(message)
          ? "Error de red al subir el archivo. Intenta de nuevo."
          : "No se pudo subir el archivo."
      )
    } finally {
      setProgress(null)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.epub,application/pdf,application/epub+zip"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        size="lg"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        aria-label="Subir libro"
      >
        <Upload className="size-4" />
        {loading ? (
          <span className="tabular-nums">Subiendo… {progress}%</span>
        ) : (
          <>
            <span className="hidden sm:inline">Subir libro</span>
            <span className="sm:hidden">Subir</span>
          </>
        )}
      </Button>
      {(error || success) && (
        <p
          role="status"
          className={`order-last w-full text-sm sm:text-right ${
            error ? "text-destructive" : "text-green-600 dark:text-green-400"
          }`}
        >
          {error ?? "Libro subido correctamente"}
        </p>
      )}
    </>
  )
}
