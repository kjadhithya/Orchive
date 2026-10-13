# Orchive

A private reading app — library, reader, notes, graph, timeline and goals — built with Next.js and Supabase.

## Run locally

```bash
npm install        # also copies the reader engines into public/vendor
npm run dev        # http://localhost:3000
```

The Supabase URL and publishable key are built in (see `src/lib/supabase.ts`); to point at another project, copy `.env.example` to `.env.local` and change the values.

## Deploy to Vercel

Either:

- **CLI:** `npx vercel` in this folder, then `npx vercel --prod`.
- **GitHub:** push this folder to a repository, then *Add New → Project* on vercel.com and import it. Framework: Next.js; no settings to change.

## After the first deploy — Supabase auth URLs

In the Supabase dashboard → Authentication → URL Configuration, add your Vercel address (for example `https://orchive.vercel.app/**`) to **Redirect URLs**. Sign-up confirmation and password-reset emails link back through these URLs.

## Notes

- Database tables are prefixed `orchive_`; files live in the private `orchive-books` storage bucket (50 MB per file).
- DjVu and CHM files are stored and downloadable but not rendered in the browser.
- Account deletion is not implemented yet.
