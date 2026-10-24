# SearchGrid – instrukcja dla właściciela strony

Strona: **https://gta-searchgrid.vercel.app**

## Jak to działa w skrócie

- **Zwykły adres** to publiczny podgląd dla widzów: lista organizacji z włączoną „Publiczną mapą”
  i ich przeszukane kwadraty w jednym kolorze. Nic więcej (bez nicków, kolorów, godzin, pinezek).
- **Ukryty link logowania** i **ukryty link rejestracji** – jedyne miejsca, gdzie pojawia się
  formularz. Linki są zapisane wyłącznie w bazie, nie ma ich w kodzie ani w repozytorium.
  Znajdziesz je w **Panelu superadmina → Ukryte linki** (tam też wygenerujesz nowe, gdyby wyciekły).
  Każdy inny adres (`/login`, `/admin`, cokolwiek) pokazuje publiczną mapę.
- Po zalogowaniu adres skraca się do zwykłej domeny i widać mapę organizacji.
- Logowanie jest zapamiętywane w przeglądarce: po zamknięciu karty czy restarcie komputera wystarczy
  wejść na zwykły adres. Trzeba zalogować się ponownie dopiero po „Wyloguj”, wyczyszczeniu danych
  przeglądarki, w trybie incognito albo na innym urządzeniu.

## Pierwsze kroki

1. Wejdź w ukryty link rejestracji i załóż konto (nick + hasło, min. 8 znaków).
3. Nadaj sobie rolę superadmina (jednorazowo) – w Supabase → SQL Editor:
   ```sql
   update public.profiles set is_superadmin = true where lower(username) = lower('TWÓJ_NICK');
   ```
   Kolejnych superadminów nadajesz już z panelu (`/admin` po zalogowaniu, ikonka tarczy na mapie).
4. Załóż organizację (albo zrób to z panelu superadmina) i wybierz kolor.
5. Rozdaj ludziom **link rejestracji** i **kod zaproszenia** organizacji (Ustawienia w panelu mapy).
   Konta możesz też zakładać sam w panelu superadmina (nick, hasło, organizacja).

## Obsługa mapy

- Klik w pusty kwadrat – zaznacz swoim kolorem, klik w swój – odznacz, cudzego nie ruszysz.
- **Shift + przeciągnij** (albo przycisk pędzla, na telefonie) – maluje wiele kwadratów; zaczęte na
  swoim kwadracie – ściera.
- **Pinezka** (ikona 📍): klik w mapę → rodzaj + notatka. Właściciel może usunąć każdą.
- Panel: Członkowie (kto online, klik = pokaż tylko tę osobę), Historia (klik = pokaż na mapie),
  Ustawienia (właściciel: kod zaproszenia, publiczna mapa i opóźnienie, czyszczenie mapy).
- Konto (ikona ludzika): zmiana koloru, wyjście z organizacji.

## Streamerzy

W Ustawieniach organizacji włącz „Publiczna mapa”, wybierz opóźnienie (na żywo / 5 / 15 / 30 min)
i skopiuj „Link dla widzów” (`https://gta-searchgrid.vercel.app/?org=…`).

**Tryb OBS** – „Link do OBS” w Ustawieniach (`…/?org=…&obs=1`): sama mapa przycięta do żółtej ramki
siatki, bez paneli, przycisków i etykiet. Zrobiona pod małe okienko w rogu streamu: przygaszone tło,
bez linii siatki, przeszukane miejsca jako wyraźne bursztynowe obszary, a świeżo zaznaczone kwadraty
rozbłyskują na kilka sekund. Mapa zachowuje proporcje siatki i jest wyśrodkowana, a wokół niej
źródło w OBS jest przezroczyste – najlepiej ustawić rozmiar w tych proporcjach (np. 560 × 820 albo
290 × 425), wtedy nie ma pustych pasów. W prawym dolnym rogu (nad oceanem) jest mały podpis
net-flow.pl; `&label=0` go ukrywa. W OBS: scena → „+” → Przeglądarka → wklej link, ustaw rozmiar.
Przybliżanie: prawy klik na źródle → Interakcja. Tryb OBS zawsze pokazuje tylko dane publiczne,
nawet w przeglądarce, w której ktoś jest zalogowany.

## Zabezpieczenia (co jest zrobione)

- Wszystkie uprawnienia sprawdza baza (RLS + funkcje), nie przeglądarka. Test ataków:
  `supabase/tests/security.sql` (uruchom w SQL Editor – wynik `ALL SECURITY TESTS PASSED`).
- Rejestracja tylko z ukrytego linku (sprawdzane po stronie serwera); konta spoza tego procesu są
  nieaktywne. Limity prób: rejestracja 5/h z IP, kody zaproszeń 10/10 min, zaznaczanie 3000/min,
  pinezki 30/min.
- Kanał na żywo organizacji zmienia klucz przy wyrzuceniu członka – wyrzucony przestaje dostawać dane.
- Nagłówki bezpieczeństwa (CSP, zakaz osadzania w ramce, HSTS…) w `vercel.json`.

## Zalecane ustawienia w panelu Supabase (opcjonalne, 1 minuta)

- **Realtime → Settings → wyłącz „Allow public access”** – wymusza prywatne kanały dla wszystkich
  (aplikacja i tak używa tylko prywatnych).
- **Authentication → Sign In / Providers → „Allow new users to sign up”** – możesz wyłączyć, jeśli
  nie będziesz używać Discorda (rejestracja przez ukryty link działa dalej).

## Logowanie przez Discord (opcjonalnie, później)

1. https://discord.com/developers/applications → New Application → OAuth2 → dodaj Redirect:
   `https://weuovmvfodwqznsvhjjp.supabase.co/auth/v1/callback`; skopiuj Client ID i Client Secret.
2. Supabase → Authentication → Sign In / Providers → Discord → włącz, wklej ID i Secret.
3. Supabase → Authentication → URL Configuration: Site URL `https://gta-searchgrid.vercel.app`,
   Redirect URLs `https://gta-searchgrid.vercel.app/**`.
4. Vercel → projekt `gta-searchgrid` → Settings → Environment Variables: `VITE_DISCORD_ENABLED=true`,
   potem Redeploy.
   Nowe konto przez Discord trzeba założyć z **ukrytego linku rejestracji** (inaczej będzie nieaktywne –
   superadmin może je aktywować w panelu).

## Dla programisty

```bash
npm install
npm run dev      # http://localhost:5173 (wymaga .env.local – patrz .env.example)
npm test         # testy jednostkowe
npm run build
```

- Baza: migracje w `supabase/migrations/` (projekt Supabase `gta-map`, region eu-central-1).
- Funkcje serwerowe: `supabase/functions/` (`register`, `admin-users`); dozwolone adresy stron
  (CORS) w `supabase/functions/_shared/http.ts` – dopisz tam własną domenę, jeśli ją podepniesz.
- Siatka: `src/lib/grid.ts` (kwadrat 64 px ≈ 96 m; zmiana rozmiaru wymaga też zmiany zakresów w SQL).
- Mapa: kafelki z https://github.com/VIRUXE/gtav-map-tiles (`npm run fetch-tiles`).
  Mapa GTA V jest własnością Rockstar Games; projekt jest nieoficjalny.
- Push na gałąź `main` = automatyczne wdrożenie na Vercel.
