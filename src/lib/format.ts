import { boundsLabel } from './grid';
import { pinEmoji } from './pins';

export type ActivityEntry = {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_is_superadmin: boolean;
  kind: string;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < MINUTE) return 'przed chwilą';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min temu`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} godz. temu`;
  const days = Math.floor(diff / DAY);
  return days === 1 ? 'wczoraj' : `${days} dni temu`;
}

export function pluralCells(n: number): string {
  if (n === 1) return 'kwadrat';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'kwadraty';
  return 'kwadratów';
}

function cellsText(d: Record<string, any>): string {
  const count = Number(d.count ?? 0);
  const hasBounds = [d.minX, d.minY, d.maxX, d.maxY].every((v) => typeof v === 'number');
  const range = hasBounds ? ` (${boundsLabel({ minX: d.minX, minY: d.minY, maxX: d.maxX, maxY: d.maxY })})` : '';
  return `${count} ${pluralCells(count)}${range}`;
}

export function describeActivity(e: ActivityEntry): string {
  const actor = `${e.actor_name ?? 'Ktoś'}${e.actor_is_superadmin ? ' (superadmin)' : ''}`;
  const d = e.data ?? {};
  const pin = () => `${pinEmoji(String(d.icon))} ‘${String(d.body ?? '')}’`;
  switch (e.kind) {
    case 'cells_marked': return `${actor} zaznaczył(a) ${cellsText(d)}`;
    case 'cells_unmarked': return `${actor} odznaczył(a) ${cellsText(d)}`;
    case 'pin_added': return `${actor} dodał(a) pinezkę ${pin()}`;
    case 'pin_edited': return `${actor} zmienił(a) pinezkę ${pin()}`;
    case 'pin_removed': return `${actor} usunął(ęła) pinezkę ${pin()}`;
    case 'org_created': return `${actor} założył(a) organizację`;
    case 'member_joined': return `${actor} dołączył(a) do organizacji`;
    case 'member_left': return `${actor} opuścił(a) organizację`;
    case 'member_kicked': return `${actor} wyrzucił(a) ${String(d.username ?? 'członka')}`;
    case 'member_moved': return `${actor} przeniósł(a) ${String(d.username ?? 'członka')} do organizacji`;
    case 'map_cleared': {
      const n = Number(d.count ?? 0);
      return `${actor} wyczyścił(a) mapę (${n} ${pluralCells(n)})`;
    }
    case 'owner_changed': return `${actor}: nowy właściciel – ${String(d.username ?? '?')}`;
    case 'org_public_changed':
      if (!d.is_public) return `${actor}: mapa publiczna wyłączona`;
      return `${actor}: mapa publiczna włączona, ${Number(d.delay) > 0 ? `opóźnienie ${Number(d.delay)} min` : 'na żywo'}`;
    default: return `${actor}: ${e.kind}`;
  }
}
