# GTA Map – wspólna mapa przeszukiwań dla organizacji

Data: 2026-09-29
Status: zatwierdzony projekt (do przeglądu przez użytkownika)

## Cel

Strona z satelitarną mapą GTA 5 (2D) pokrytą siatką kwadracików. Gracze z jednej organizacji
zaznaczają swoim kolorem, które kwadraty przeszukali, stawiają pinezki z notatkami, widzą historię
zmian i kto jest online. Wszystko zapisuje się automatycznie i synchronizuje na żywo w obrębie
organizacji. Zwykły adres strony to publiczny, zanonimizowany podgląd dla widzów (np. streamów).
Logowanie i rejestracja są dostępne tylko pod ukrytymi, trudnymi do odgadnięcia linkami.
Strona działa na Vercelu, backend w Supabase.

## Role

| Rola | Kto | Może |
|---|---|---|
| Widz | każdy, bez logowania | publiczny podgląd map organizacji, które są publiczne – tylko które kwadraty są zaznaczone, jednym neutralnym kolorem |
| Członek | aktywne konto przypisane do organizacji | zaznaczać/odznaczać swoje kwadraty, stawiać/edytować/usuwać swoje pinezki, przeglądać historię, widzieć kto online, zmieniać swój kolor, wyjść z organizacji |
| Właściciel organizacji | założyciel (lub wskazany przez superadmina) | to co członek + nowy kod zaproszenia, wyrzucenie członka, wyczyszczenie mapy, usunięcie każdej pinezki, przełącznik „Publiczna mapa”, opóźnienie publicznego podglądu |
| Superadmin | flaga `is_superadmin` | panel admina: podgląd każdej organizacji (tylko odczyt, na żywo, pełne dane), tworzenie/usuwanie organizacji, zmiana właściciela, tworzenie kont innym, przenoszenie kont, reset hasła, usuwanie kont, czyszczenie mapy, ustawienia publiczności, nadawanie/odbieranie superadmina (nie sobie), generowanie nowych ukrytych linków |

Pierwszy superadmin: użytkownik zakłada konto przez ukryty link rejestracji, flagę ustawiamy poleceniem SQL.

## Adresy i dostęp

- `/` (i `/?org=<id>`) – **niezalogowany**: publiczny podgląd. **Zalogowany**: panel organizacji.
- **Ukryty link logowania** i **ukryty link rejestracji** – ścieżki postaci
  `/<słowo>-<losowe ≥16 znaków>` (np. `/wejscie-7Hq2ZpX9vKm4Tn8c`). Ścieżki są przechowywane
  wyłącznie w bazie (generowane w bazie, nie ma ich w repozytorium ani w kodzie strony).
  Strona przy każdej ścieżce innej niż `/` pyta bazę (`resolve_access_path`), czym jest:
  `login` / `register` / nic. Nieznana ścieżka (`/login`, `/admin`, cokolwiek) → publiczny podgląd,
  bez żadnej wskazówki, że logowanie istnieje.
- Po zalogowaniu adres jest podmieniany na `/` (bez przeładowania) i pokazuje się panel.
  Wylogowanie → `/` (publiczny podgląd).
- Trasy panelu dla zalogowanych: `/`, `/konto`, `/admin`, `/admin/org/<id>`. Dla niezalogowanych
  każda z nich wygląda jak publiczny podgląd; dla nie-superadmina `/admin*` → `/`.
- Superadmin w panelu widzi obecne ukryte linki i może wygenerować nowe (stare przestają działać).

## Rejestracja i aktywacja kont

- Rejestracja nick + hasło tylko przez ukryty link rejestracji. Funkcja serwerowa `register`
  wymaga klucza rejestracji (ścieżki linku) – sprawdza go w bazie, więc ominięcie strony nic nie daje.
- Każde konto ma flagę `activated`. Aktywne są konta z `register` i konta zakładane przez superadmina.
  Konta powstałe inaczej (np. publiczne `/auth/v1/signup` Supabase, Discord poza ukrytym linkiem) są
  nieaktywne: wszystkie reguły bazy wymagają `activated = true`, więc nic nie mogą. Po zalogowaniu
  widzą tylko ekran „Konto nieaktywne” z wylogowaniem.
- Discord (opcjonalnie, gdy skonfigurowany i `VITE_DISCORD_ENABLED=true`): przycisk na stronie
  logowania i rejestracji. Z ukrytego linku rejestracji po powrocie z Discorda strona wywołuje
  `activate_account(klucz)`.
- Logowanie: ukryty link logowania, nick + hasło (lub Discord).
- Po rejestracji: onboarding (załóż organizację / dołącz kodem) → wybór koloru → mapa.

## Przepływ członka

1. **Onboarding** (konto bez organizacji): „Załóż organizację” (nazwa → właściciel, kod zaproszenia)
   albo „Dołącz kodem”.
2. **Wybór koloru** (konto w organizacji bez koloru): siatka 80 kolorów, zajęte przez innych członków
   wyszarzone i przekreślone (tooltip: czyj), nieklikalne; wybrany podświetlony ramką.
3. **Mapa** – ekran główny z panelem bocznym (zakładki: Członkowie, Historia, Ustawienia – ta ostatnia
   tylko dla właściciela).
4. **Konto** – zmiana koloru, wyjście z organizacji, wylogowanie.

Jedno konto należy do najwyżej jednej organizacji. Zmiana organizacji (dołączenie, wyrzucenie,
przeniesienie, wyjście) usuwa kwadraty i pinezki użytkownika w starej organizacji i zeruje jego kolor.

## Zasady

- **Nazwy organizacji** unikalne bez względu na wielkość liter („Ekipa” = „EKIPA”), wyświetlana pisownia
  założyciela, 2–32 znaki, przycinane spacje.
- **Nicki** unikalne bez względu na wielkość liter, 3–20 znaków `[A-Za-z0-9_-]`.
- **Hasło** min. 8 znaków.
- **Kod zaproszenia**: 6 znaków z `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, wpisywanie bez znaczenia wielkości liter.
- **Kolory**: stała paleta 80 kolorów (16 odcieni × 5 tonów), baza przyjmuje tylko kolory z palety.
  Para (organizacja, kolor) unikalna. Zmiana koloru przemalowuje kwadraty i pinezki użytkownika u wszystkich.
- **Kwadraty**: jeden właściciel na kwadrat. Klik w pusty → zaznacza. Klik w mój → odznacza.
  Klik w cudzy → nic (tooltip: kto i kiedy).
- **Pędzel**: Shift + przeciąganie (desktop) lub przełącznik „Pędzel” (telefon). Start na pustym =
  malowanie (pomija zajęte), start na moim = gumka (usuwa tylko moje).
- **Wyjście właściciela**: własność przechodzi na najdłużej będącego członka; brak członków → organizacja usunięta.
- **Wyczyść mapę** (właściciel, superadmin): z potwierdzeniem; usuwa wszystkie kwadraty (pinezki zostają).

## Pinezki z notatką

- Przycisk „📍 Pinezka” → klik w mapę → wybór ikonki: ❗ ważne, 📦 znalezione, 🚪 wejście,
  ❓ do sprawdzenia, ⚠️ niebezpiecznie, 💬 notatka → tekst (1–300 znaków) → zapis.
- Pinezka w kolorze autora, w dokładnym punkcie mapy (współrzędne obrazu, nie kwadrat).
  Klik → dymek z ikonką, tekstem, autorem, czasem; autor: „Edytuj”, „Usuń”; właściciel: „Usuń”.
- Panel mapy: przełącznik „Pokaż pinezki” + filtr po ikonkach.
- Limit 500 pinezek na organizację, 30 nowych na minutę na osobę.
- Tekst zawsze wyświetlany jako zwykły tekst (nigdy HTML).

## Historia zmian

- Zakładka „Historia”: wpisy od najnowszych, doładowywanie starszych, filtr po osobie. Przykłady:
  „Adam zaznaczył 12 kwadracików (K-40 … M-45) · 3 min temu”, „Ola dodała pinezkę 📦 ‘skrzynka za
  garażem’”, „Kuba dołączył”, „Właściciel wyczyścił mapę”, „Mapa publiczna: włączona, opóźnienie 15 min”.
- Rodzaje: zaznaczenie, odznaczenie, pinezka dodana/zmieniona/usunięta, dołączenie, wyjście, wyrzucenie,
  wyczyszczenie mapy, zmiana właściciela, zmiana ustawień publiczności. Akcje superadmina oznaczone „(superadmin)”.
- Wpisy tworzy baza (triggery / funkcje) – nie da się ich pominąć ani podrobić z przeglądarki.
- Grupowanie: kolejne zaznaczenia (lub odznaczenia) tej samej osoby w odstępie < 10 s dopisują się do
  jednego wpisu – jedno przeciągnięcie pędzlem = jeden wpis.
- Klik we wpis z kwadratami/pinezką → mapa przesuwa się tam i na chwilę podświetla te miejsca.
- Nowe wpisy pojawiają się na żywo. Wpisy starsze niż 30 dni usuwane automatycznie (pg_cron).

## Kto jest online

- Presence na kanale organizacji: zielona kropka przy nicku i licznik „N online” w panelu.
  Znika kilka sekund po zamknięciu karty.
- Superadmin w podglądzie nie zgłasza obecności (nie jest widoczny jako online).

## Publiczny podgląd (widzowie)

- Lewy panel: lista organizacji z włączonym „Publiczna mapa” (tylko nazwy) + informacja „Na żywo” /
  „Opóźnienie N min”. Wybór organizacji → mapa. Bezpośredni link do organizacji: `/?org=<id>`
  (do dania streamerom). Właściciel widzi ten link w Ustawieniach.
- Widz widzi wyłącznie mapę, siatkę i zaznaczone kwadraty jednym neutralnym kolorem. **Nie** widzi:
  kolorów, kto, kiedy, pinezek, historii, członków, online.
- Dane dla widza pochodzą z osobnych funkcji zwracających tylko współrzędne (`x, y`), a zdarzenia
  na żywo z osobnego kanału z samymi współrzędnymi. Dane organizacji niepublicznej są niedostępne.
- **Opóźnienie** (ustawia właściciel/superadmin): na żywo / 5 / 15 / 30 min, domyślnie na żywo.
  - Na żywo: publiczny kanał `pub:<org_id>` wysyła zmiany (tylko `x, y`).
  - Z opóźnieniem: widz dostaje stan mapy sprzed N minut (liczony w bazie z dziennika zmian kwadratów)
    i odświeża go co 30 s; kanał na żywo nie jest dla niego dostępny.
- Wyłączenie „Publiczna mapa” → widzowie tej organizacji widzą „Mapa niedostępna”, organizacja znika z listy.

## Mapa i siatka

- Satelitarna mapa GTA 5, obraz źródłowy 8192×8192 px, pocięty na kafelki 256 px, zoom 0–5
  (+ overzoom do 6), statycznie z `public/tiles/{z}/{x}/{y}.jpg`. Obraz pobierany z sieci po zgodzie
  użytkownika (lub gotowy zestaw kafelków).
- Leaflet z `CRS.Simple`: kółko/pinch = zoom, przeciąganie = przesuwanie, granice mapy ograniczone.
- Siatka: kwadrat 64 px obrazu (≈ 96 m w grze), obejmuje prostokąt lądu (granice w `src/lib/grid.ts`,
  ustalone po wybraniu obrazu). Rozmiar kwadratu to jedna stała.
- Etykiety: kolumny literami jak w Excelu (A…Z, AA…), wiersze liczbami od 1 od góry: `K-42`, `BC-7`.
  Pasek statusu pokazuje etykietę kwadratu pod kursorem.
- Rysowanie: jeden `canvas` nad mapą, tylko widoczne kwadraty. Zaznaczony = wypełnienie (alfa ~0.45)
  + obrys; w publicznym podglądzie jeden neutralny kolor. Linie siatki cienkie, przygaszone przy oddaleniu.
- Panel członków: klik w osobę = podświetlenie tylko jej kwadratów i pinezek.

## Architektura

```
Przeglądarka (Vite + React + TS, Leaflet, Tailwind)  ── statycznie na Vercelu (nagłówki bezpieczeństwa)
   │  supabase-js: RPC, REST, Auth, Realtime (websocket)
   ▼
Supabase
   ├─ Postgres: organizations, profiles, cells, pins, activity, cell_events, access_paths, rate_limits
   │            + RLS + funkcje RPC (security definer, search_path = '')
   ├─ Auth: nick+hasło (syntetyczny e-mail `<nick>@users.invalid`), opcjonalnie Discord
   ├─ Realtime: prywatne kanały `org:<id>` (broadcast + presence) i `pub:<id>` (broadcast, tylko odczyt)
   ├─ pg_cron: czyszczenie activity (>30 dni), cell_events (>1 h), rate_limits
   └─ Edge Functions: `register`, `admin-users`
```

### Moduły frontendu

| Moduł | Odpowiedzialność |
|---|---|
| `lib/grid.ts` | konfiguracja siatki; piksel ↔ kwadrat ↔ etykieta |
| `lib/palette.ts` | 80 kolorów palety (ta sama lista w migracji SQL) |
| `lib/pins.ts` | lista ikonek pinezek |
| `lib/validation.ts` | nick, hasło, nazwa organizacji, kod zaproszenia, tekst pinezki; nick → e-mail |
| `lib/supabase.ts` | klient Supabase |
| `lib/api.ts` | wszystkie wywołania bazy/RPC/edge functions |
| `lib/format.ts` | czas względny, opisy wpisów historii |
| `state/orgStore.ts` | stan organizacji: kwadraty, członkowie, pinezki, historia, operacje optymistyczne; czyste reduktory |
| `state/useOrgRealtime.ts` | kanał `org:<id>`: zdarzenia, presence, reconnect → pełne pobranie |
| `state/usePublicMap.ts` | publiczny stan: pobranie, kanał `pub:<id>` lub odpytywanie co 30 s |
| `map/GtaMap.tsx` | Leaflet + kafelki |
| `map/GridLayer.ts` | canvas: siatka, kwadraty, hover, klik, pędzel, tryb neutralny |
| `map/brush.ts` | zbieranie kwadratów z przeciągania, paczki co ~150 ms |
| `map/PinLayer.tsx` | pinezki (markery DOM budowane przez `textContent`) + dymek |
| `components/*` | ColorPicker, MembersPanel, HistoryPanel, OrgSettings, PinEditor, Toasts, ConnectionBar, ConfirmDialog |
| `pages/*` | PublicViewer, Login, Register, Inactive, Onboarding, ChooseColor, MapPage, Account, Admin, AdminOrgView |
| `app/AccessGate.tsx` | routing: niezalogowany → publiczny/ukryte linki; zalogowany → panel; przekierowania |
| `auth/AuthProvider.tsx` | sesja + profil |

## Model danych

```sql
organizations(
  id uuid pk default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 32),  -- unique index on lower(name)
  invite_code text not null unique,
  owner_id uuid references profiles(id) on delete set null,
  is_public boolean not null default false,
  public_delay_minutes smallint not null default 0 check (public_delay_minutes in (0,5,15,30)),
  created_at timestamptz not null default now()
)

profiles(
  id uuid pk references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_-]{3,20}$'),  -- unique index on lower(username)
  org_id uuid references organizations(id) on delete set null,
  color text check (color in (<paleta>)),
  joined_at timestamptz,
  activated boolean not null default false,
  is_superadmin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, color)
)

cells(
  org_id uuid references organizations(id) on delete cascade,
  x smallint not null, y smallint not null,          -- check w zakresie siatki
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (org_id, x, y)
)

pins(
  id uuid pk default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  px real not null, py real not null,                -- w granicach obrazu
  icon text not null check (icon in ('important','found','entrance','check','danger','note')),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

activity(
  id bigint generated always as identity pk,
  org_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  actor_name text,                                   -- zachowany nick (np. po usunięciu konta)
  actor_is_superadmin boolean not null default false,
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

cell_events(                                         -- dziennik do opóźnionego podglądu, retencja 1 h
  id bigint generated always as identity pk,
  org_id uuid not null, x smallint not null, y smallint not null,
  added boolean not null,
  at timestamptz not null default now()
)

access_paths(kind text pk check (kind in ('login','register')), path text not null unique, rotated_at timestamptz)

rate_limits(bucket text, window_start timestamptz, hits int, primary key (bucket, window_start))
```

Profil tworzy trigger na `auth.users`: nick z `raw_user_meta_data.username` (konta z `register`/admina,
`activated` z `raw_app_meta_data.activated`, ustawianego tylko przez service role); dla Discorda nick
z nazwy Discord oczyszczonej do dozwolonych znaków, z sufiksem liczbowym przy kolizji, `activated = false`.

## Funkcje bazy (RPC)

Wszystkie `security definer`, `set search_path = ''`, sprawdzają uprawnienia i walidują wejście,
`execute` odebrane `public`/`anon` poza funkcjami publicznymi.

- **Publiczne (anon):** `resolve_access_path(path) → 'login'|'register'|null`,
  `public_list_orgs() → [{id, name, delay}]`, `public_get_cells(org_id) → int[] (x0,y0,x1,y1,…)`
  (z uwzględnieniem opóźnienia).
- **Użytkownik:** `activate_account(key)`, `create_org(name)`, `join_org(code)`, `leave_org()`,
  `set_color(color)`, `get_org_cells(org_id)` (kompaktowo: x, y, indeks użytkownika, czas),
  `mark_cells(cells int[])` → wstawione, `unmark_cells(cells int[])` → usunięte,
  `add_pin`, `update_pin`, `delete_pin`, `get_activity(org_id, before_id, actor_id?)`.
- **Właściciel:** `regenerate_invite()`, `kick_member(user_id)`, `clear_map()`,
  `set_org_public(is_public, delay)`.
- **Superadmin:** `admin_list_orgs()`, `admin_list_users()`, `admin_create_org(name, owner_id)`,
  `admin_set_owner(org_id, user_id)`, `admin_delete_org(org_id)`, `admin_move_user(user_id, org_id|null)`,
  `admin_clear_map(org_id)`, `admin_set_org_public(org_id, is_public, delay)`,
  `admin_set_superadmin(user_id, bool)` (nie na sobie), `admin_get_access_paths()`,
  `admin_rotate_access_path(kind)`.
- **Edge Functions** (service role, JWT weryfikowany, CORS tylko adres strony + localhost w dev):
  - `register` (publiczna): klucz rejestracji, nick, hasło → limit 5/h na IP → `auth.admin.createUser`
    (`email_confirm: true`, `user_metadata.username`, `app_metadata.activated = true`).
  - `admin-users` (superadmin): `create_user(username, password, org_id?)`, `reset_password`, `delete_user`.

## Bezpieczeństwo

**Baza**
- RLS włączone na każdej tabeli; brak polityk = brak dostępu. Wszystkie reguły wymagają `activated`.
- `organizations` SELECT: członek lub superadmin. `profiles` SELECT: ja, członkowie mojej organizacji,
  superadmin. `cells`/`pins`/`activity` SELECT: członek lub superadmin. Zapis do `cells`, `pins`,
  `profiles`, `organizations` tylko przez RPC. `cell_events`, `access_paths`, `rate_limits`: brak
  dostępu z zewnątrz (tylko funkcje).
- Anon nie ma dostępu do żadnej tabeli; tylko do funkcji publicznych, które zwracają wyłącznie
  nazwy organizacji publicznych i współrzędne.
- Walidacja w bazie: formaty, długości, paleta, ikonki, zakres współrzędnych kwadratów i pinezek.
- `realtime.messages`: `authenticated` odbiera `org:<id>` gdy jest aktywnym członkiem lub superadminem;
  wysyłać może tylko presence na własnym `org:<id>` (nie superadmin w podglądzie); `anon`/`authenticated`
  odbierają `pub:<id>` tylko gdy organizacja jest publiczna z opóźnieniem 0. Nikt poza bazą nie nadaje broadcastów.
- Superadmin nie może odebrać uprawnień samemu sobie.

**Ataki na konta i spam**
- Hasła: min. 8 znaków, bcrypt (Supabase). Ogólny komunikat „Zły nick lub hasło”.
  Limity logowania po stronie Supabase Auth.
- Limity (`rate_limits`, okno stałe): rejestracja 5/h na IP, `join_org` 10 / 10 min na osobę,
  `create_org` 5/h, zaznaczanie 3000 kwadratów/min, pinezki 30/min, 500 pinezek na organizację.
- Ukryte linki: ≥ 16 losowych znaków (≈ 95 bitów), tylko w bazie, rotowalne przez superadmina.
  Rejestracja weryfikowana po stronie serwera; konta spoza procesu nieaktywne.
- Service role key tylko w sekretach Edge Functions; w przeglądarce wyłącznie klucz publiczny.

**Przeglądarka**
- React escapuje tekst; dymki Leaflet i markery budowane przez `textContent`, nigdy `innerHTML`.
- Nagłówki (vercel.json): `Content-Security-Policy` (`default-src 'self'`; `script-src 'self'`;
  `connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co`; `img-src 'self' data: blob:`;
  `style-src 'self' 'unsafe-inline'`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`;
  `form-action 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy` (kamera/mikrofon/geolokalizacja wyłączone), `Strict-Transport-Security`,
  `X-Frame-Options: DENY`.

**Kontrola końcowa**
- Supabase advisors (security + performance) – zero ostrzeżeń bezpieczeństwa.
- `npm audit` bez podatności wysokich/krytycznych.
- Przegląd bezpieczeństwa kodu.
- Testy ataków (muszą się nie udać): odznaczenie cudzego kwadratu, odczyt innej organizacji, nadanie sobie
  superadmina / zmiana `org_id` bezpośrednio, wstrzyknięcie skryptu w pinezkę/nick/nazwę organizacji,
  rejestracja bez klucza, działanie nieaktywnym kontem, odczyt `user_id` przez funkcje publiczne,
  subskrypcja cudzego `org:<id>` i `pub:<id>` organizacji niepublicznej, nadanie broadcastu z klienta.

## Synchronizacja na żywo

- Kanał `org:<org_id>` (prywatny): zdarzenia wysyłane przez triggery w bazie:
  - `cells_added {cells:[x,y,user_id,created_at…]}` / `cells_removed {cells:[x,y…]}` – trigger na poziomie
    instrukcji, jedna wiadomość na instrukcję; > 500 kwadratów → `resync`.
  - `member_changed {profile}` / `member_removed {user_id}`, `org_changed {org}`, `org_deleted`.
  - `pin_upserted {pin}` / `pin_removed {id}`, `activity_upserted {entry}`.
  - Presence: `{user_id}` każdego członka (poza superadminem w podglądzie).
- Kanał `pub:<org_id>`: `cells_added {cells:[x,y…]}` / `cells_removed {cells:[x,y…]}` / `resync` /
  `visibility_changed` – tylko gdy organizacja publiczna i opóźnienie 0 (zmiana ustawień zawsze wysyła
  `visibility_changed`).
- Klient członka:
  - Start: organizacja, członkowie, kwadraty (`get_org_cells`), pinezki, pierwsza strona historii.
  - Klik: optymistyczna zmiana + `mark_cells`/`unmark_cells`; nie wstawione/nie usunięte → cofnięcie
    + „Ktoś był szybszy” / „Nie udało się zapisać”.
  - Pędzel: paczki co ~150 ms tymi samymi funkcjami.
  - Zdarzenia z kanału nakładane idempotentnie. Rozłączenie → pasek „Rozłączono – łączę ponownie…”,
    edycja zablokowana; po powrocie pełne pobranie.
  - `member_removed` (ja) / `org_deleted` → onboarding.

## Obsługa błędów

- Walidacja formularzy po stronie klienta + komunikaty bazy przetłumaczone na polski.
- Operacje destrukcyjne z potwierdzeniem. Toasty dla błędów zapisu, pasek stanu połączenia.
- Przekroczony limit → „Zwolnij trochę – spróbuj za chwilę”.

## Konfiguracja i wdrożenie

- Zmienne: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_DISCORD_ENABLED`.
  Sekrety Edge Functions: `ALLOWED_ORIGINS`.
- Supabase: nowy projekt (plan darmowy), migracje w `supabase/migrations/`, funkcje w `supabase/functions/`.
  Ukryte linki generowane w bazie przy migracji i przekazane użytkownikowi.
- Vercel: build Vite, `vercel.json` z przekierowaniem SPA i nagłówkami bezpieczeństwa.
  Supabase Auth: Site URL i Redirect URLs = adres Vercela.
- Kafelki mapy w `public/tiles/` (commitowane); obraz źródłowy poza repo, `scripts/make-tiles.mjs` (sharp).
- Discord (później, opcjonalnie): instrukcja dla użytkownika.

## Testy

- Vitest: `grid.ts`, `palette.ts`, `validation.ts`, `format.ts`, reduktory `orgStore`
  (optymistyczne operacje, cofanie, zdarzenia, resync), `brush.ts`.
- SQL: skrypt testów RLS/RPC jako role: anon, nieaktywny, członek, obcy, właściciel, superadmin –
  w tym opóźniony stan publiczny i wszystkie „testy ataków” z sekcji Bezpieczeństwo.
- E2E w przeglądarce: dwa konta w jednej organizacji (zaznaczenie widoczne w drugim oknie, konflikt,
  pinezka, historia, online, zmiana koloru), publiczny podgląd bez danych osobowych, ukryte linki,
  panel superadmina; na koniec na wdrożonej wersji Vercel.

## Poza zakresem

- Wiele organizacji na konto, reset hasła przez e-mail (resetuje superadmin), inne style mapy,
  captcha (możliwa później: Cloudflare Turnstile), tryb nakładki OBS.
