import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PALETTE } from '../src/lib/palette';
import { PIN_ICONS, pinEmoji } from '../src/lib/pins';
import { validateUsername, validatePassword, validateOrgName, normalizeInviteCode, validateInviteCode, validatePinBody, usernameToEmail } from '../src/lib/validation';
import { relativeTime, describeActivity, pluralCells } from '../src/lib/format';

describe('palette', () => {
  it('has 80 unique lowercase hex colors', () => {
    expect(PALETTE).toHaveLength(80);
    expect(new Set(PALETTE).size).toBe(80);
    for (const c of PALETTE) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('matches the SQL palette', () => {
    const sql = readFileSync('supabase/migrations/0001_schema.sql', 'utf8');
    const m = sql.match(/-- PALETTE-BEGIN([\s\S]*?)-- PALETTE-END/);
    expect(m).not.toBeNull();
    expect(m![1].match(/#[0-9a-f]{6}/g)).toEqual([...PALETTE]);
  });
});

describe('pins', () => {
  it('has six icons', () => {
    expect(PIN_ICONS.map((i) => i.id)).toEqual(['important', 'found', 'entrance', 'check', 'danger', 'note']);
    expect(pinEmoji('found')).toBe('📦');
  });
});

describe('validation', () => {
  it('usernames', () => {
    expect(validateUsername('Adam_1')).toBeNull();
    expect(validateUsername('ab')).not.toBeNull();
    expect(validateUsername('a'.repeat(21))).not.toBeNull();
    expect(validateUsername('zła nazwa')).not.toBeNull();
    expect(validateUsername('<script>')).not.toBeNull();
  });

  it('passwords', () => {
    expect(validatePassword('1234567')).not.toBeNull();
    expect(validatePassword('12345678')).toBeNull();
  });

  it('org names', () => {
    expect(validateOrgName(' Ekipa ')).toBeNull();
    expect(validateOrgName('E')).not.toBeNull();
    expect(validateOrgName('x'.repeat(33))).not.toBeNull();
    expect(validateOrgName('a\u0000b')).not.toBeNull();
  });

  it('invite codes', () => {
    expect(normalizeInviteCode(' k7f2qx ')).toBe('K7F2QX');
    expect(validateInviteCode('K7F2QX')).toBeNull();
    expect(validateInviteCode('K7F2Q')).not.toBeNull();
    expect(validateInviteCode('K7F2Q0')).not.toBeNull();
  });

  it('pin bodies', () => {
    expect(validatePinBody('')).not.toBeNull();
    expect(validatePinBody('x'.repeat(300))).toBeNull();
    expect(validatePinBody('x'.repeat(301))).not.toBeNull();
    expect(validatePinBody('linia 1\nlinia 2')).toBeNull();
  });

  it('maps usernames to synthetic emails', () => {
    expect(usernameToEmail('Adam_1')).toBe('adam_1@users.invalid');
  });
});

describe('format', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  it('relative time', () => {
    expect(relativeTime('2026-09-29T11:59:50Z', now)).toBe('przed chwilą');
    expect(relativeTime('2026-09-29T11:57:00Z', now)).toBe('3 min temu');
    expect(relativeTime('2026-09-29T10:00:00Z', now)).toBe('2 godz. temu');
    expect(relativeTime('2026-09-28T10:00:00Z', now)).toBe('wczoraj');
    expect(relativeTime('2026-09-24T10:00:00Z', now)).toBe('5 dni temu');
  });

  it('polish plurals', () => {
    expect([1, 2, 4, 5, 12, 13, 22, 25, 104].map(pluralCells)).toEqual(['kwadrat', 'kwadraty', 'kwadraty', 'kwadratów', 'kwadratów', 'kwadratów', 'kwadraty', 'kwadratów', 'kwadraty']);
  });

  const base = { id: 1, actor_id: 'u', actor_name: 'Adam', actor_is_superadmin: false, created_at: '', updated_at: '' };

  it('describes activity', () => {
    expect(describeActivity({ ...base, kind: 'cells_marked', data: { count: 12, minX: 10, minY: 39, maxX: 12, maxY: 44 } })).toBe('Adam zaznaczył(a) 12 kwadratów (K-40 … M-45)');
    expect(describeActivity({ ...base, kind: 'cells_marked', data: { count: 1, minX: 10, minY: 39, maxX: 10, maxY: 39 } })).toBe('Adam zaznaczył(a) 1 kwadrat (K-40)');
    expect(describeActivity({ ...base, kind: 'cells_unmarked', data: { count: 3, minX: 0, minY: 0, maxX: 2, maxY: 0 } })).toBe('Adam odznaczył(a) 3 kwadraty (A-1 … C-1)');
    expect(describeActivity({ ...base, kind: 'pin_added', data: { icon: 'found', body: 'skrzynka' } })).toBe('Adam dodał(a) pinezkę 📦 ‘skrzynka’');
    expect(describeActivity({ ...base, actor_is_superadmin: true, kind: 'map_cleared', data: { count: 40 } })).toBe('Adam (superadmin) wyczyścił(a) mapę (40 kwadratów)');
    expect(describeActivity({ ...base, kind: 'org_public_changed', data: { is_public: true, delay: 15 } })).toBe('Adam: mapa publiczna włączona, opóźnienie 15 min');
    expect(describeActivity({ ...base, kind: 'org_public_changed', data: { is_public: true, delay: 0 } })).toBe('Adam: mapa publiczna włączona, na żywo');
    expect(describeActivity({ ...base, kind: 'org_public_changed', data: { is_public: false, delay: 0 } })).toBe('Adam: mapa publiczna wyłączona');
  });
});
