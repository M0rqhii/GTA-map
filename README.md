# SearchGrid

Wspólna mapa przeszukiwań GTA 5 dla organizacji: siatka kwadratów na satelitarnej mapie, każdy członek
zaznacza swoim kolorem, zmiany synchronizują się na żywo. Pinezki z notatkami, historia zmian, lista
osób online, publiczny (zanonimizowany) podgląd dla widzów, panel superadmina.

- Strona: https://gta-searchgrid.vercel.app
- Instrukcja: [docs/INSTRUKCJA.md](docs/INSTRUKCJA.md)
- Projekt i plan: [docs/superpowers/](docs/superpowers/)

Stack: Vite + React + TypeScript + Leaflet + Tailwind, Supabase (Postgres z RLS, Realtime, Edge Functions), Vercel.

## Setup

Skopiuj `.env.example` do `.env` i uzupełnij dane swojego projektu Supabase:

```bash
cp .env.example .env
# VITE_SUPABASE_URL=
# VITE_SUPABASE_PUBLISHABLE_KEY=
# VITE_DISCORD_ENABLED=false
```

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
npm test
```

Schemat bazy znajduje się w `supabase/migrations/`.

Dostęp do konkretnej organizacji (mapa, panel admina) jest przyznawany przez unikalny token w URL, generowany i rozsyłany poza repozytorium — nie jest hardcodowany w kodzie.
