import { readFileSync } from "node:fs"
import path from "node:path"
import type { Page } from "@playwright/test"
import { hkdf } from "@panva/hkdf"
import { EncryptJWT, base64url, calculateJwkThumbprint } from "jose"

const COOKIE_NAME = "authjs.session-token"
const MAX_AGE = 30 * 24 * 60 * 60

type E2eState = {
  userId: string
  pdfBookId: string
  epubBookId: string
}

export function readState(): E2eState {
  return JSON.parse(
    readFileSync(path.join(__dirname, "..", ".state.json"), "utf-8")
  ) as E2eState
}

/** Replica exactamente el cifrado JWE de Auth.js (alg "dir", enc
 *  "A256CBC-HS512", clave derivada con hkdf y salt = nombre de cookie)
 *  para forjar una sesión JWT válida sin pasar por Google OAuth. */
export async function createSessionToken(
  payload: Record<string, unknown>
): Promise<string> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error("AUTH_SECRET is required to forge the e2e session token")
  }
  const salt = COOKIE_NAME
  const encryptionSecret = await hkdf(
    "sha256",
    secret,
    salt,
    `Auth.js Generated Encryption Key (${salt})`,
    64
  )
  const thumbprint = await calculateJwkThumbprint(
    { kty: "oct", k: base64url.encode(encryptionSecret) },
    "sha512"
  )
  const now = Math.floor(Date.now() / 1000)
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256CBC-HS512", kid: thumbprint })
    .setIssuedAt()
    .setExpirationTime(now + MAX_AGE)
    .setJti(crypto.randomUUID())
    .encrypt(encryptionSecret)
}

/** Inyecta la cookie de sesión forjada en el contexto del page. */
export async function setAuthCookie(page: Page, userId: string) {
  const token = await createSessionToken({
    sub: userId,
    name: "E2E User",
    email: "e2e@lector.test",
  })
  await page.context().addCookies([
    { name: COOKIE_NAME, value: token, domain: "localhost", path: "/" },
  ])
}