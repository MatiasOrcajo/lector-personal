"use client"

import { useState, useRef } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { uploadBook } from "@/app/actions/upload"

export function UploadButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    const formData = new FormData()
    formData.append("file", file)

    try {
      const result = await uploadBook(formData)

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setLoading(false)
    }

    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.epub"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        size="lg"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        <Upload className="size-4" />
        {loading ? "Uploading..." : "Upload Book"}
      </Button>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Book uploaded successfully
        </p>
      )}
    </div>
  )
}
