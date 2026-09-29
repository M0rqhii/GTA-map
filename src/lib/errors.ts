const MESSAGES: Record<string, string> = {
  rate_limited: 'Zwolnij trochę – spróbuj za chwilę.',
  name_taken: 'Organizacja o tej nazwie już istnieje.',
  color_taken: 'Ten kolor jest już zajęty – wybierz inny.',
  username_taken: 'Ten nick jest już zajęty.',
  invalid_input: 'Nieprawidłowe dane.',
  not_allowed: 'Brak uprawnień.',
  already_in_org: 'Już należysz do organizacji.',
  invalid_code: 'Nieprawidłowy kod zaproszenia.',
  pin_limit: 'Organizacja ma już 500 pinezek – usuńcie niepotrzebne.',
  not_found: 'Nie znaleziono.',
  signup_disabled: 'Rejestracja jest niedostępna.',
  server_error: 'Błąd serwera – spróbuj ponownie.',
  offline: 'Brak połączenia – poczekaj, aż mapa się zsynchronizuje.',
  'Invalid login credentials': 'Zły nick lub hasło.',
};

export function errorCode(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return '';
}

export function errorMessage(e: unknown): string {
  const code = errorCode(e);
  if (MESSAGES[code]) return MESSAGES[code];
  for (const [key, message] of Object.entries(MESSAGES)) if (code.includes(key)) return message;
  if (/fetch|network|timeout/i.test(code)) return 'Brak połączenia z serwerem.';
  return 'Coś poszło nie tak. Spróbuj ponownie.';
}
