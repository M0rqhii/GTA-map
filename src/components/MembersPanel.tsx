import type { Member } from '../state/orgReducer';
import { pluralCells } from '../lib/format';
import { Swatch } from './ui';
import { IconCrown, IconX } from './icons';

type Props = {
  members: Member[];
  cellCounts: Map<string, number>;
  online: Set<string>;
  ownerId: string | null;
  meId: string;
  canKick: boolean;
  highlightUser: string | null;
  onHighlight: (userId: string | null) => void;
  onKick: (member: Member) => void;
};

export function MembersPanel({ members, cellCounts, online, ownerId, meId, canKick, highlightUser, onHighlight, onKick }: Props) {
  const sorted = [...members].sort((a, b) =>
    Number(b.id === ownerId) - Number(a.id === ownerId)
    || Number(online.has(b.id)) - Number(online.has(a.id))
    || a.username.localeCompare(b.username, 'pl'));
  const onlineCount = members.filter((m) => online.has(m.id)).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="label-caps">{members.length} w organizacji</span>
        <span className="label-caps text-ok">● {onlineCount} online</span>
      </div>
      <ul className="space-y-0.5">
        {sorted.map((m) => {
          const active = highlightUser === m.id;
          const count = cellCounts.get(m.id) ?? 0;
          return (
            <li key={m.id} className="group flex items-stretch">
              <button
                type="button"
                onClick={() => onHighlight(active ? null : m.id)}
                aria-pressed={active}
                title={active ? 'Pokaż wszystkich' : 'Pokaż tylko tę osobę'}
                className={[
                  'flex min-w-0 flex-1 items-center gap-3 border-l-2 px-2.5 py-2 text-left transition-colors',
                  active ? 'border-sun bg-sun-soft' : 'border-transparent hover:bg-ink-700/60',
                ].join(' ')}
              >
                <span className="relative">
                  <Swatch color={m.color} size={16} />
                  <span
                    className={`absolute -bottom-1 -right-1 h-2 w-2 rounded-full border border-ink-900 ${online.has(m.id) ? 'bg-ok' : 'bg-ink-500'}`}
                    title={online.has(m.id) ? 'Online' : 'Offline'}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-ink-100">{m.username}</span>
                    {m.id === meId ? <span className="font-mono text-[11px] text-ink-400">(ty)</span> : null}
                    {m.id === ownerId ? <IconCrown width={13} height={13} className="shrink-0 text-sun" /> : null}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-400">{count} {pluralCells(count)}</span>
                </span>
              </button>
              {canKick && m.id !== meId ? (
                <button
                  type="button"
                  onClick={() => onKick(m)}
                  className="px-2 text-ink-500 opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  title={`Wyrzuć ${m.username}`}
                  aria-label={`Wyrzuć ${m.username}`}
                >
                  <IconX />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
