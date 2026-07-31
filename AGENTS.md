<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Framework Versions (all bleeding edge, assume breaking changes)

- **Next.js 16.2.12** (not 14/15)
- **React 19.2.4**
- **Prisma 7.9.1**
- **Tailwind CSS v4** — no `tailwind.config.ts`; config lives in CSS via `@theme inline`
- **shadcn/ui v4** (style: `base-nova`) — uses `@base-ui/react/button` instead of Radix
- **TypeScript 5** with `strict: true`

## Commands

```bash
npm run dev          # start dev server
npm run build        # production build
npm run lint         # eslint (no type-import, just Next.js rules)
npx tsc --noEmit     # type-check (no npm script — run directly)
npx prisma generate  # regenerate client after schema changes
npx prisma db push   # push schema to DB (no migrations yet)
npx shadcn@latest add <component>  # add shadcn components
```

**Verification order**: `npx tsc --noEmit` then `npm run lint`. Build is optional but confirms no runtime errors.

## Prisma 7 Criticals

- **No `url` in the datasource block** of `prisma/schema.prisma`. Connection URL lives in `prisma.config.ts` at `datasource.url`.
- **PrismaClient requires an adapter**: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`. See `src/lib/prisma.ts`.
- Generated client outputs to `src/generated/prisma/`. **Import from `@/generated/prisma/client`** (not `@/generated/prisma`).
- Always run `npx prisma generate` after editing the schema.

## shadcn/ui v4 Gotchas

- Button does **NOT support `asChild`**. The primitive is `@base-ui/react/button`. To render a Button as a `<Link>`, wrap `<Link>` around `<Button>` or use `render={<Link href="..." />}`.
- CSS uses oklch color space variables. Light/dark theming is via `:root` and `.dark` classes in `globals.css`.
- Install components with `npx shadcn@latest add <name>` — they land in `src/components/ui/`.

## Architecture Rules

- **All Prisma calls must happen on the server only** — Server Components or Server Actions (`"use server"`).
- **Client Components** (`"use client"`) must never import Prisma or access `process.env` directly.
- Import alias `@/*` → `src/*`.
- Server Actions live in `src/app/actions/` and use `revalidatePath("/")` to refresh data after mutations.
- File uploads go through `@vercel/blob` `put()` in the Server Action, then Prisma insert.

## Environment

```
DATABASE_URL="postgresql://..."    # Neon Postgres connection string
BLOB_READ_WRITE_TOKEN="..."        # Vercel Blob read-write token
```
