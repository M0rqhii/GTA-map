export type PinIcon = 'important' | 'found' | 'entrance' | 'check' | 'danger' | 'note';

export const PIN_ICONS: readonly { id: PinIcon; emoji: string; label: string }[] = [
  { id: 'important', emoji: '❗', label: 'Ważne' },
  { id: 'found', emoji: '📦', label: 'Znalezione' },
  { id: 'entrance', emoji: '🚪', label: 'Wejście' },
  { id: 'check', emoji: '❓', label: 'Do sprawdzenia' },
  { id: 'danger', emoji: '⚠️', label: 'Niebezpiecznie' },
  { id: 'note', emoji: '💬', label: 'Notatka' },
];

export function pinEmoji(id: string): string {
  return PIN_ICONS.find((i) => i.id === id)?.emoji ?? '📍';
}
