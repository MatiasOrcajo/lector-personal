import "dotenv/config"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Client } from "pg"
import { put } from "@vercel/blob"
import { strToU8, zipSync } from "fflate"

export const E2E_EMAIL = "e2e@lector.test"
export const E2E_USER_NAME = "E2E User"

const STATE_PATH = path.join(__dirname, ".state.json")

/** Genera un PDF mínimo de una página con offsets de xref correctos. */
function buildPdf(): Uint8Array {
  const objects: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    4: null as unknown as string,
    5: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  }
  const stream = "BT /F1 24 Tf 72 720 Td (Hello PDF) Tj ET"
  objects[4] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`

  let pdf = "%PDF-1.4\n"
  const offsets: Record<number, number> = {}
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pdf.length
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefStart = pdf.length
  let xref = "xref\n0 6\n0000000000 65535 f \n"
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`
  }
  pdf += xref
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return strToU8(pdf)
}

/** Genera un EPUB mínimo válido (mimetype primero y sin comprimir). */
function buildEpub(): Uint8Array {
  const files = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    ),
    "OEBPS/content.opf": strToU8(
      `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">e2e-sample</dc:identifier>
    <dc:title>E2E Sample</dc:title>
    <dc:language>es</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
  </spine>
</package>`
    ),
    "OEBPS/toc.ncx": strToU8(
      `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="e2e-sample"/></head>
  <docTitle><text>E2E Sample</text></docTitle>
  <navMap>
    <navPoint id="np-1" playOrder="1">
      <navLabel><text>Capitulo 1</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`
    ),
    "OEBPS/chapter1.xhtml": strToU8(
      `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Capitulo 1</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1 id="capitulo-1">Capitulo 1</h1>
  <p>Este es un libro de prueba para los tests E2E.</p>
</body>
</html>`
    ),
    "OEBPS/style.css": strToU8("body { font-family: sans-serif; }\np { line-height: 1.6; }"),
  }
  return zipSync(files, { level: 0 })
}

export default async function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for e2e tests")
  }
  if (!blobToken) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for e2e tests")
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  // Upsert del usuario de pruebas (misma estructura de columnas que Prisma).
  const userResult = await client.query(
    `INSERT INTO "User" (id, name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT ("email") DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [randomUUID(), E2E_USER_NAME, E2E_EMAIL]
  )
  const userId = userResult.rows[0].id as string

  // Limpieza de corridas anteriores.
  const oldBooks = await client.query(
    `SELECT id FROM "Book" WHERE "userId" = $1 AND title LIKE $2`,
    [userId, "[E2E]%"]
  )
  const oldIds = oldBooks.rows.map((r) => r.id as string)
  if (oldIds.length > 0) {
    await client.query(
      `DELETE FROM "Highlight" WHERE "bookId" = ANY($1::text[])`,
      [oldIds]
    )
    await client.query(
      `DELETE FROM "Book" WHERE id = ANY($1::text[])`,
      [oldIds]
    )
  }

  const suffix = Date.now()
  const pdfUrl = (
    await put(`e2e/sample-${suffix}.pdf`, Buffer.from(buildPdf()), {
      access: "private",
    })
  ).url
  const epubUrl = (
    await put(`e2e/sample-${suffix}.epub`, Buffer.from(buildEpub()), {
      access: "private",
    })
  ).url

  const pdfBookId = randomUUID()
  const epubBookId = randomUUID()
  await client.query(
    `INSERT INTO "Book" (id, title, format, "blobUrl", "userId", "lastLocation")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [pdfBookId, "[E2E] PDF Sample", "pdf", pdfUrl, userId, "page:1"]
  )
  await client.query(
    `INSERT INTO "Book" (id, title, format, "blobUrl", "userId")
     VALUES ($1, $2, $3, $4, $5)`,
    [epubBookId, "[E2E] EPUB Sample", "epub", epubUrl, userId]
  )
  await client.query(
    `INSERT INTO "Highlight" (id, text, color, "pdfPage", "pdfRects", "pageLabel", "userId", "bookId")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      "Hello PDF",
      "yellow",
      1,
      JSON.stringify([{ x: 10, y: 10, width: 200, height: 20 }]),
      "Página 1",
      userId,
      pdfBookId,
    ]
  )

  await client.end()

  mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  writeFileSync(
    STATE_PATH,
    JSON.stringify({ userId, pdfBookId, epubBookId })
  )
}