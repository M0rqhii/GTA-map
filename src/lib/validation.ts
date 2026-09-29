export const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PIN_BODY_MAX = 300;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const CONTROL_CHARS_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const INVITE_RE = new RegExp(`^[${INVITE_ALPHABET}]{6}$`);

export function validateUsername(s: string): string | null {
  return USERNAME_RE.test(s) ? null : 'Nick: 3–20 znaków, tylko litery, cyfry, _ i -';
}

export function validatePassword(s: string): string | null {
  return s.length >= 8 ? null : 'Hasło musi mieć co najmniej 8 znaków';
}

export function validateOrgName(s: string): string | null {
  const name = s.trim();
  if (name.length < 2 || name.length > 32) return 'Nazwa: 2–32 znaki';
  if (CONTROL_CHARS.test(name)) return 'Nazwa zawiera niedozwolone znaki';
  return null;
}

export function normalizeInviteCode(s: string): string {
  return s.trim().toUpperCase();
}

export function validateInviteCode(s: string): string | null {
  return INVITE_RE.test(s) ? null : 'Kod ma 6 znaków (litery i cyfry)';
}

export function validatePinBody(s: string): string | null {
  if (s.trim().length === 0) return 'Wpisz treść notatki';
  if (s.length > PIN_BODY_MAX) return `Maksymalnie ${PIN_BODY_MAX} znaków`;
  if (CONTROL_CHARS_EXCEPT_NEWLINE.test(s)) return 'Tekst zawiera niedozwolone znaki';
  return null;
}

export function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@users.invalid`;
}
