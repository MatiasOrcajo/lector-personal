<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Stack (all bleeding edge, assume breaking changes)

- **Next.js 16.2.12** (App Router), **React 19.2.4**, **TypeScript 5** (`strict: true`)
- **Prisma 7.9.1** + Neon Postgres, **@vercel/blob** for storage
- **Tailwind CSS v4** — no `tailwind.config.ts`; theme via `@theme inline` in `src/app/globals.css` (oklch vars, `:root` / `.dark`)
- **shadcn/ui v4** (style: `base-nova`, lucide icons) — uses `@base-ui/react`, NOT Radix

## Commands

```bash
npm run dev          # start dev server
npm run build        # production build
npm run lint         # eslint (core-web-vitals + typescript configs)
npm run test         # unit/component tests (Vitest + React Testing Library, jsdom)
npm run test:e2e     # E2E tests (Playwright, Chromium) — arranca dev server y siembra datos
npx tsc --noEmit     # type-check (no npm script — run directly)
npx prisma generate  # regenerate client after schema changes
npx prisma db push   # push schema to DB (no migrations yet)
npx shadcn@latest add <component>  # add shadcn components
```

**Verification order**: `npx tsc --noEmit` then `npm run lint`, then `npm run test`. Build is optional but confirms no runtime errors. E2E (`npm run test:e2e`) requires Chromium installed (`npx playwright install chromium`) and real `DATABASE_URL` + `BLOB_READ_WRITE_TOKEN` (seeds a test user + uploads tiny fixture books to Blob; requires `npx playwright install`).

## Testing

- **Vitest** (`vitest.config.mts` + `vitest.setup.ts`): unit tests in `src/**/*.test.{ts,tsx}` with jsdom. Explicit imports from `vitest`/`@testing-library/react` (no globals). RTL cleanup + `matchMedia` mock live in `vitest.setup.ts`.
- **Playwright** (`playwright.config.ts`): E2E in `e2e/`. `e2e/global-setup.ts` seeds a user (`e2e@lector.test`), uploads generated sample PDF/EPUB to Blob and creates `e2e/.state.json` (gitignored). Sessions are forged as JWE cookies (`e2e/helpers/auth.ts`) replicating Auth.js encryption (`A256CBC-HS512` + hkdf, salt = cookie name) — no Google OAuth needed. `workers: 1` because the tests share the seeded DB state.

## Prisma 7 Criticals

- **No `url` in the datasource block** of `prisma/schema.prisma`. Connection URL lives in `prisma.config.ts` at `datasource.url` (loaded via `dotenv`).
- **PrismaClient requires an adapter**: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`. See `src/lib/prisma.ts`.
- Generated client outputs to `src/generated/prisma/`. **Import from `@/generated/prisma/client`** (not `@/generated/prisma`).
- `src/generated/prisma/` is **gitignored** — `npm install` regenerates it via `postinstall`; if install ran with `--ignore-scripts`, run `npx prisma generate` manually. `npx tsc` fails without it.
- Always run `npx prisma generate` after editing the schema.

## shadcn/ui v4 Gotchas

- Button does **NOT support `asChild`**. The primitive is `@base-ui/react/button`. To render a Button as a `<Link>`, wrap `<Link>` around `<Button>` or use `render={<Link href="..." />}`.
- Install components with `npx shadcn@latest add <name>` — they land in `src/components/ui/`; keep `components.json` (style `base-nova`) intact.

## Architecture Rules

- **All Prisma calls happen on the server only** — Server Components or Server Actions (`"use server"`).
- **Client Components** (`"use client"`) must never import Prisma or access `process.env` directly.
- Import alias `@/*` → `src/*`.
- Server Actions live in `src/app/actions/` and use `revalidatePath("/")` to refresh data after mutations.
- File uploads go through `@vercel/blob` `put()` in the Server Action, then Prisma insert. Only **pdf/epub** allowed (see `src/app/actions/upload.ts`); `experimental.serverActions.bodySizeLimit: "25mb"` is set in `next.config.ts` for this.
- Books render as Cards linking to `/read/[id]` (see `src/app/read/[id]/page.tsx`); the reader shell (`src/components/reader-wrapper.tsx`) is a format switch between the self-contained `EpubReader` and `PdfViewer` — each owns its state, progress and highlights. Fixing one viewer must not touch the other.

## Environment

```
DATABASE_URL="postgresql://..."    # Neon Postgres; missing → hard error in src/lib/prisma.ts
BLOB_READ_WRITE_TOKEN="..."        # Vercel Blob read-write token
BLOB_STORE_ID="..."                # Vercel Blob store id
```

Only `.env` (gitignored) is loaded — `prisma.config.ts` uses `dotenv/config`.
