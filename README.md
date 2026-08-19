# Website Care

A Next.js SaaS app with Supabase authentication and a protected dashboard.

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [Supabase](https://supabase.com) for authentication (`@supabase/ssr`, `@supabase/supabase-js`)
- [Tailwind CSS](https://tailwindcss.com)
- TypeScript

## Getting Started

1. Copy the environment file and fill in your Supabase project credentials:

   ```bash
   cp .env.example .env.local
   ```

   You'll need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your Supabase project's API settings.

2. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

- `app/page.tsx` — landing page
- `app/login/`, `app/signup/` — authentication pages
- `app/dashboard/` — protected dashboard (redirects to `/login` if not authenticated)
- `lib/supabase/client.ts` — Supabase client for browser/client components
- `lib/supabase/server.ts` — Supabase client for server components and actions

## Scripts

- `npm run dev` — start the development server
- `npm run build` — build for production
- `npm run start` — run the production build
- `npm run lint` — run ESLint
