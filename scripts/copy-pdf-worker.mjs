import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)
const pdfjsDistPath = path.dirname(require.resolve("pdfjs-dist/package.json"))
const source = path.join(pdfjsDistPath, "build", "pdf.worker.min.mjs")
const targetDir = path.resolve("public")
const target = path.join(targetDir, "pdf.worker.min.mjs")

if (!existsSync(source)) {
  console.error(`pdf.worker.min.mjs not found at ${source}`)
  process.exit(1)
}

mkdirSync(targetDir, { recursive: true })
copyFileSync(source, target)
console.log(`Copied pdf worker to ${target}`)
