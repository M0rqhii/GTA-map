# GTA Map – wspólna mapa przeszukiwań dla organizacji

Data: 2026-09-29
Status: zatwierdzony projekt (do przeglądu przez użytkownika)

## Cel

Prosta strona z satelitarną mapą GTA 5 (2D) pokrytą siatką kwadracików. Gracze z jednej
organizacji zaznaczają swoim kolorem, które kwadraty już przeszukali. Zmiany zapisują się
automatycznie i są widoczne u wszystkich członków organizacji na żywo. Strona działa na Vercelu.

## Role

| Rola | Kto | Może |
|---|---|---|
| Członek | każde konto przypisane do organizacji | zaznaczać/odznaczać swoje kwadraty, zmieniać swój kolor, wyjść z organizacji |
| Właściciel organizacji | założyciel organizacji (lub wskazany przez superadmina) | to co członek + nowy kod zaproszenia, wyrzucenie członka, wyczyszczenie mapy |
| Superadmin | flaga `is_superadmin` w profilu | panel `/admin`: podgląd każdej organizacji (tylko odczyt, na żywo), tworzenie/usuwanie organizacji, zmiana właściciela, tworzenie kont innym, przenoszenie kont między organizacjami, reset hasła, usuwanie kont, czyszczenie mapy dowolnej organizacji, nadawanie/odbieranie superadmina |

Pierwszy superadmin: użytkownik zakłada konto normalnie, flagę ustawiamy poleceniem SQL.

## Przepływ użytkownika

1. **Rejestracja / logowanie** – nick + hasło (bez maila). Opcjonalnie „Zaloguj przez Discord”
   (przycisk widoczny, gdy `VITE_DISCORD_ENABLED=true` i provider jest skonfigurowany w Supabase).
2. **Onboarding** (konto bez organizacji): „Załóż organizację” (nazwa → zostaję właścicielem,
   dostaję kod zaproszenia) albo „Dołącz kodem”.
3. **Wybór koloru** (konto w organizacji bez koloru): siatka 80 kolorów. Kolory zajęte przez
   innych członków organizacji są wyszarzone i przekreślone (tooltip: czyj), nieklikalne.
   Wybrany kolor ma podświetloną ramkę.
4. **Mapa** – ekran główny.
5. **Konto** – zmiana koloru (ten sam komponent siatki kolorów), wyjście z organizacji.
6. **Admin** – tylko superadmin.

Jedno konto należy do najwyżej jednej organizacji. Zmiana organizacji (dołączenie, wyrzucenie,
przeniesienie przez superadmina, wyjście) usuwa kwadraty użytkownika w starej organizacji
i zeruje jego kolor – w nowej wybiera go od nowa.

## Zasady

- **Nazwy organizacji** unikalne bez względu na wielkość liter („Ekipa” = „EKIPA”).
  Wyświetlana jest pisownia założyciela. Długość 2–32 znaki, przycinane spacje.
- **Nicki** unikalne bez względu na wielkość liter, 3–20 znaków `[A-Za-z0-9_-]`.
  Hasło min. 6 znaków.
- **Kod zaproszenia**: 6 znaków z alfabetu `ABCDEFGHJKMNPQRSTUVWXYZ23456789`,
  wpisywanie bez znaczenia wielkości liter.
- **Kolory**: stała paleta 80 kolorów (16 odcieni × 5 tonów). Para (organizacja, kolor)
  unikalna. Zmiana koloru przemalowuje wszystkie kwadraty użytkownika u wszystkich
  (kwadrat przechowuje `user_id`, kolor pobierany z profilu).
- **Kwadraty**: jeden właściciel na kwadrat. Klik w pusty → zaznacza moim kolorem.
  Klik w mój → odznacza. Klik w cudzy → nic (tooltip: kto i kiedy).
- **Pędzel**: przytrzymany Shift (desktop) lub przełącznik „Pędzel” (telefon) + przeciąganie.
  Start na pustym kwadracie = malowanie (pomija cudze i moje), start na moim = gumka
  (usuwa tylko moje). Bez pędzla przeciąganie przesuwa mapę.
- **Wyjście właściciela**: własność przechodzi na najdłużej będącego członka; jeśli nikogo
  nie ma – organizacja jest usuwana.
- **Wyczyść mapę** (właściciel, superadmin): z potwierdzeniem, usuwa wszystkie kwadraty organizacji.

## Mapa i siatka

- Satelitarna mapa GTA 5, obraz źródłowy 8192×8192 px, pocięty na kafelki 256 px,
  poziomy zoomu 0–5 (+ overzoom do 6), serwowane statycznie z `public/tiles/{z}/{x}/{y}.jpg`.
  Źródłowy plik pobieramy z sieci po zgodzie użytkownika (lub gotowy zestaw kafelków).
- Leaflet z `CRS.Simple`: kółko/pinch = zoom, przeciąganie = przesuwanie, granice mapy ograniczone.
- Siatka: kwadrat 64 px na obrazie 8192 px (≈ 96 m w grze), obejmuje prostokąt lądu
  (granice w `src/lib/grid.ts`, ustalone po wybraniu obrazu). Rozmiar kwadratu to jedna stała.
- Etykiety kwadratów: kolumny literami jak w Excelu (A…Z, AA…), wiersze liczbami od 1 od góry,
  np. `K-42`, `BC-7`. Pasek statusu pokazuje etykietę kwadratu pod kursorem.
- Rysowanie: jeden `canvas` nad mapą, rysowane tylko widoczne kwadraty. Zaznaczony kwadrat =
  wypełnienie kolorem (alfa ~0.45) + obrys. Linie siatki cienkie, półprzezroczyste; przy
  dużym oddaleniu przygaszone. Podświetlenie kwadratu pod kursorem.
- Panel boczny: lista członków (kolor, nick, liczba kwadratów, właściciel oznaczony).
  Klik w osobę = podświetlenie tylko jej kwadratów (reszta przygaszona), ponowny klik = wyłącz.
  Właściciel widzi tu kod zaproszenia (kopiuj, wygeneruj nowy), „wyrzuć” przy członkach,
  „Wyczyść mapę”.

## Architektura

```
Przeglądarka (Vite + React + TS, Leaflet, Tailwind)  ── statycznie na Vercelu
   │  supabase-js: REST (odczyt/zapis), RPC, Auth, Realtime (websocket)
   ▼
Supabase
   ├─ Postgres: organizations, profiles, cells  + RLS + funkcje RPC (security definer)
   ├─ Auth: konta nick+hasło (syntetyczny e-mail), opcjonalnie Discord OAuth
   ├─ Realtime: prywatne kanały broadcast `org:<id>` zasilane triggerami w bazie
   └─ Edge Functions: `register`, `admin-users` (operacje wymagające service role)
```

### Moduły frontendu

| Moduł | Odpowiedzialność |
|---|---|
| `lib/grid.ts` | konfiguracja siatki; piksel ↔ kwadrat ↔ etykieta; czysta logika |
| `lib/palette.ts` | 80 kolorów palety |
| `lib/validation.ts` | nick, nazwa organizacji, kod zaproszenia, hasło; nick → syntetyczny e-mail |
| `lib/supabase.ts` | klient Supabase |
| `lib/api.ts` | wszystkie wywołania bazy/RPC/edge functions (jedno miejsce) |
| `state/mapStore.ts` | stan mapy: kwadraty, członkowie, operacje optymistyczne; czyste reduktory |
| `state/useOrgRealtime.ts` | subskrypcja kanału `org:<id>`, reconnect → pełne pobranie |
| `map/GtaMap.tsx` | Leaflet + kafelki |
| `map/GridLayer.ts` | warstwa canvas: rysowanie siatki i kwadratów, hover, klik, pędzel |
| `map/brush.ts` | zbieranie kwadratów z przeciągania, wysyłka paczkami co ~150 ms |
| `components/ColorPicker.tsx` | siatka kolorów z zajętymi |
| `components/MembersPanel.tsx` | lista członków + akcje właściciela |
| `pages/*` | Login, Register, Onboarding, ChooseColor, MapPage, Account, Admin, AdminOrgView |
| `auth/AuthProvider.tsx` | sesja + profil + przekierowania (brak org → onboarding, brak koloru → wybór koloru) |

## Model danych

```sql
organizations(
  id uuid pk default gen_random_uuid(),
  name text not null,                       -- unique index on lower(name)
  invite_code text not null unique,
  owner_id uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
)

profiles(
  id uuid pk references auth.users(id) on delete cascade,
  username text not null,                   -- unique index on lower(username)
  org_id uuid references organizations(id) on delete set null,
  color text check (color ~ '^#[0-9a-f]{6}$'),
  joined_at timestamptz,                    -- kiedy dołączył do obecnej organizacji
  is_superadmin boolean not null default false,
  created_at timestamptz default now(),
  unique (org_id, color)
)

cells(
  org_id uuid references organizations(id) on delete cascade,
  x smallint not null, y smallint not null, -- check w zakresie siatki
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (org_id, x, y)
)
```

Profil tworzy trigger na `auth.users` (nick z `raw_user_meta_data.username`; dla Discorda z nazwy
użytkownika Discord, oczyszczonej do dozwolonych znaków, z sufiksem liczbowym przy kolizji).

## Bezpieczeństwo (RLS)

- Pomocnicze funkcje: `my_org_id()`, `is_superadmin()` (security definer, stabilne).
- `organizations` SELECT: członek tej organizacji lub superadmin. Brak bezpośredniego INSERT/UPDATE/DELETE.
- `profiles` SELECT: ja, członkowie mojej organizacji, superadmin. Brak bezpośredniego UPDATE
  (tylko przez RPC – żeby nie dało się samemu ustawić `is_superadmin` ani `org_id`).
- `cells` SELECT: członek organizacji lub superadmin. INSERT: `user_id = auth.uid()` i
  `org_id = my_org_id()` i profil ma kolor. DELETE: `user_id = auth.uid()`.
  Superadmin w podglądzie nie zaznacza (brak polityki INSERT dla cudzej organizacji).
- RPC (security definer, każda sprawdza uprawnienia i waliduje wejście):
  - użytkownik: `create_org(name)`, `join_org(code)`, `leave_org()`, `set_color(color)`
  - właściciel: `regenerate_invite()`, `kick_member(user_id)`, `clear_map()`
  - superadmin: `admin_list_orgs()` (z liczbą członków i kwadratów), `admin_list_users()`,
    `admin_create_org(name, owner_id)`, `admin_set_owner(org_id, user_id)`,
    `admin_delete_org(org_id)`, `admin_move_user(user_id, org_id | null)`,
    `admin_clear_map(org_id)`, `admin_set_superadmin(user_id, bool)`
- Edge Functions (service role, walidacja JWT):
  - `register` – publiczna: waliduje nick/hasło, `auth.admin.createUser` z syntetycznym e-mailem
    `<nick małymi literami>@users.invalid` (TLD zarezerwowane, nic nie jest wysyłane),
    `email_confirm: true`, `user_metadata.username`. Klient potem loguje się `signInWithPassword`.
  - `admin-users` – tylko superadmin: `create_user(username, password, org_id?)`,
    `reset_password(user_id, password)`, `delete_user(user_id)`.
- Realtime: `realtime.messages` z polityką SELECT dla `authenticated`:
  `realtime.topic() = 'org:' || my_org_id()` lub `is_superadmin()`. Klienci nie nadają.

## Synchronizacja na żywo

- Kanał prywatny `org:<org_id>` (broadcast). Zdarzenia wysyła baza triggerami:
  - `cells` – trigger **na poziomie instrukcji** (tabele przejściowe): jedna wiadomość na
    instrukcję i organizację: `cells_added {cells:[{x,y,user_id,created_at}]}` /
    `cells_removed {cells:[{x,y}]}`. Powyżej 500 kwadratów w jednej instrukcji zamiast listy
    wysyłane jest `resync` (np. czyszczenie mapy) – klienci pobierają stan od nowa.
  - `profiles` – `member_changed {profile}` (dołączenie, zmiana koloru) do nowej organizacji,
    `member_removed {user_id}` do starej przy zmianie/wyjściu.
  - `organizations` – `org_changed {org}` (kod, właściciel, nazwa), `org_deleted`.
- Klient:
  - Start: pobranie organizacji, członków i wszystkich kwadratów (stronicowanie po 1000).
  - Klik: optymistyczna zmiana + zapis w tle. Konflikt (kwadrat już zajęty) lub błąd →
    cofnięcie + komunikat „Ktoś był szybszy” / „Nie udało się zapisać”.
  - Pędzel: paczki co ~150 ms, `insert … on conflict do nothing` z `select` – nie wstawione
    kwadraty są cofane; gumka usuwa paczką tylko moje.
  - Zdarzenia z kanału nakładane na stan; własne potwierdzone zmiany są idempotentne.
  - Rozłączenie → pasek „Rozłączono – łączę ponownie…”, zaznaczanie zablokowane;
    po ponownym połączeniu pełne pobranie stanu.
  - `member_removed` dotyczące mnie / `org_deleted` → przekierowanie na onboarding.

## Obsługa błędów

- Formularze: walidacja po stronie klienta + komunikaty z bazy przetłumaczone na polski
  (nick zajęty, nazwa organizacji zajęta, zły kod, kolor zajęty, złe hasło).
- Operacje destrukcyjne (wyrzuć, wyczyść mapę, usuń organizację/konto) z potwierdzeniem.
- Toasty dla błędów zapisu; pasek stanu połączenia.

## Konfiguracja i wdrożenie

- `.env.local` / zmienne Vercela: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_DISCORD_ENABLED`.
- Supabase: nowy projekt na darmowym planie; migracje w `supabase/migrations/`,
  edge functions w `supabase/functions/`.
- Vercel: build Vite, `vercel.json` z przekierowaniem wszystkich ścieżek na `index.html` (SPA).
- Kafelki mapy commitowane w `public/tiles/`; obraz źródłowy poza repo (`.gitignore`),
  skrypt `scripts/make-tiles.mjs` (sharp) do ich wygenerowania.
- Discord (opcjonalnie, później): instrukcja dla użytkownika – aplikacja w Discord Developer
  Portal, redirect URL Supabase, client id/secret w panelu Supabase, `VITE_DISCORD_ENABLED=true`.

## Testy

- Vitest (jednostkowe): `grid.ts` (piksel↔kwadrat↔etykieta, granice), `palette.ts`
  (80 unikalnych kolorów), `validation.ts`, reduktory `mapStore` (optymistyczne operacje,
  cofanie, nakładanie zdarzeń, resync), `brush.ts` (tryb malowania/gumki, paczkowanie).
- Baza: skrypt SQL sprawdzający RLS i RPC jako różni użytkownicy
  (członek, obcy, właściciel, superadmin) – `set local role authenticated` + `request.jwt.claims`.
- E2E ręczne przez przeglądarkę: dwa okna, dwa konta w jednej organizacji – zaznaczenie w jednym
  widoczne w drugim; konflikt kwadratu; zmiana koloru; podgląd superadmina; wdrożona wersja na Vercelu.

## Poza zakresem

- Znaczniki/notatki na mapie, historia zmian, obecność „kto teraz online”, wiele organizacji
  na konto, reset hasła przez e-mail (hasło resetuje superadmin), inne style mapy.
