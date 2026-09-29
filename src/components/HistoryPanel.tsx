import { useEffect, useMemo, useState } from 'react';
import { describeActivity, relativeTime, type ActivityEntry } from '../lib/format';
import type { Member } from '../state/orgReducer';
import { Button, Swatch } from './ui';

type Props = {
  entries: ActivityEntry[];
  done: boolean;
  members: Map<string, Member>;
  onLoadMore: () => Promise<void>;
  onJump: (entry: ActivityEntry) => void;
};

export function isJumpable(e: ActivityEntry): boolean {
  const d = e.data ?? {};
  return typeof d.minX === 'number' || typeof d.px === 'number';
}

export function HistoryPanel({ entries, done, members, onLoadMore, onJump }: Props) {
  const [actor, setActor] = useState('');
  const [loading, setLoading] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const actors = useMemo(() => {
    const byId = new Map<string, string>();
    for (const m of members.values()) byId.set(m.id, m.username);
    for (const e of entries) if (e.actor_id && e.actor_name && !byId.has(e.actor_id)) byId.set(e.actor_id, e.actor_name);
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pl'));
  }, [members, entries]);

  const visible = actor ? entries.filter((e) => e.actor_id === actor) : entries;

  return (
    <div>
      <label className="mb-3 block">
        <span className="label-caps">Osoba</span>
        <select
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className="mt-1.5 block h-9 w-full border border-ink-600 bg-ink-950/70 px-2 text-[15px] text-ink-100 outline-none focus:border-sun"
        >
          <option value="">Wszyscy</option>
          {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>

      {visible.length === 0 ? (
        <p className="px-1 py-4 text-ink-400">Brak wpisów.</p>
      ) : (
        <ol className="relative space-y-0.5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-ink-700">
          {visible.map((e) => {
            const jumpable = isJumpable(e);
            const color = e.actor_id ? members.get(e.actor_id)?.color ?? null : null;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  disabled={!jumpable}
                  onClick={() => onJump(e)}
                  className="relative flex w-full gap-3 py-2 pl-0 pr-1 text-left enabled:hover:bg-ink-700/50 disabled:cursor-default"
                >
                  <Swatch color={color ?? '#3a4659'} size={15} className="relative mt-0.5 outline outline-2 outline-ink-850" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] leading-snug text-ink-100 [overflow-wrap:anywhere]">{describeActivity(e)}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-ink-400">
                      {relativeTime(e.updated_at)}{jumpable ? ' · pokaż na mapie' : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {!done ? (
        <Button
          variant="subtle"
          size="sm"
          className="mt-3 w-full"
          loading={loading}
          onClick={async () => { setLoading(true); await onLoadMore(); setLoading(false); }}
        >
          Wczytaj starsze
        </Button>
      ) : null}
      <p className="mt-3 px-1 font-mono text-[11px] text-ink-500">Historia przechowywana 30 dni.</p>
    </div>
  );
}
