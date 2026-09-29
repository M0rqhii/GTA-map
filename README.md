# SearchGrid

Wspólna mapa przeszukiwań GTA 5 dla organizacji: siatka kwadratów na satelitarnej mapie, każdy członek
zaznacza swoim kolorem, zmiany synchronizują się na żywo. Pinezki z notatkami, historia zmian, lista
osób online, publiczny (zanonimizowany) podgląd dla widzów, panel superadmina.

- Strona: https://gta-searchgrid.vercel.app
- Instrukcja: [docs/INSTRUKCJA.md](docs/INSTRUKCJA.md)
- Projekt i plan: [docs/superpowers/](docs/superpowers/)

Stack: Vite + React + TypeScript + Leaflet + Tailwind, Supabase (Postgres z RLS, Realtime, Edge Functions), Vercel.

```bash
npm install
npm run dev
npm test
```
