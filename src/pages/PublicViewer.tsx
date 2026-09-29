import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type L from 'leaflet';
import { GtaMap } from '../map/GtaMap';
import { useGridLayer, useHoverOutline } from '../map/hooks';
import { useMapPointer } from '../map/useMapPointer';
import { usePublicMap } from '../state/usePublicMap';
import { cellLabel, type CellXY } from '../lib/grid';
import { pluralCells } from '../lib/format';
import { Wordmark } from '../components/ui';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Anonymous view: which cells an org has searched, in a single neutral color. Nothing else.
export function PublicViewer() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('org');
  const orgId = raw && UUID_RE.test(raw) ? raw : null;
  const { orgs, cells, status, delay, live } = usePublicMap(orgId);
  const [map, setMap] = useState<L.Map | null>(null);
  const [hover, setHover] = useState<CellXY | null>(null);
  const [panelOpen, setPanelOpen] = useState(!orgId);

  useGridLayer(map, { cells, neutral: true, highlightUser: null }, cells);
  useHoverOutline(map, hover);
  useMapPointer(map, false, { onHover: setHover });

  const selected = orgs?.find((o) => o.id === orgId) ?? null;
  const choose = (id: string) => {
    setParams({ org: id });
    setPanelOpen(false);
  };

  return (
    <div className="relative h-full overflow-hidden bg-ink-950">
      <GtaMap onReady={setMap} leftInset={336} />

      {/* Org picker */}
      <aside
        className={[
          'hud absolute z-[1000] flex flex-col transition-transform duration-300',
          'inset-x-3 bottom-3 max-h-[60vh] sm:inset-x-auto sm:bottom-auto sm:left-4 sm:top-4 sm:max-h-[calc(100%-2rem)] sm:w-80',
          panelOpen ? 'translate-y-0' : 'translate-y-[calc(100%-3.25rem)] sm:translate-y-0',
        ].join(' ')}
      >
        <button type="button" className="flex h-13 shrink-0 items-center justify-between gap-3 px-4 text-left sm:pointer-events-none" onClick={() => setPanelOpen((o) => !o)}>
          <Wordmark size="sm" />
          <span className="label-caps sm:hidden">{panelOpen ? 'Zwiń' : 'Organizacje'}</span>
        </button>
        <div className="border-t border-ink-700 px-4 pb-4 pt-3">
          <p className="label-caps">Podgląd przeszukań</p>
        </div>
        <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {orgs === null ? (
            <li className="px-2 py-3 text-ink-400">Wczytywanie…</li>
          ) : orgs.length === 0 ? (
            <li className="px-2 py-3 text-ink-300">Żadna organizacja nie udostępnia teraz swojej mapy.</li>
          ) : (
            orgs.map((o, i) => {
              const active = o.id === orgId;
              return (
                <li key={o.id} className="animate-rise" style={{ animationDelay: `${i * 30}ms` }}>
                  <button
                    type="button"
                    onClick={() => choose(o.id)}
                    className={[
                      'group flex w-full items-center justify-between gap-3 border-l-2 px-3 py-2.5 text-left transition-colors',
                      active ? 'border-sun bg-sun-soft text-ink-100' : 'border-transparent text-ink-200 hover:border-ink-400 hover:bg-ink-700/60',
                    ].join(' ')}
                  >
                    <span className="truncate font-display text-lg font-semibold uppercase tracking-[0.06em]">{o.name}</span>
                    <span className={`shrink-0 font-mono text-[11px] uppercase tracking-wider ${o.delay === 0 ? 'text-ok' : 'text-ink-400'}`}>
                      {o.delay === 0 ? '● na żywo' : `⏱ ${o.delay} min`}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* Status bar */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 sm:bottom-4 sm:top-auto">
        <div className="hud flex items-center gap-4 px-4 py-2 font-mono text-[13px]">
          {selected ? (
            <>
              <span className="max-w-[40vw] truncate font-display text-base font-semibold uppercase tracking-[0.08em] text-ink-100">{selected.name}</span>
              <span className={delay === 0 ? (live ? 'text-ok' : 'text-ink-400') : 'text-ink-300'}>
                {delay === 0 ? (live ? '● NA ŻYWO' : '○ ŁĄCZENIE') : `⏱ −${delay} MIN`}
              </span>
              <span className="text-ink-300">{cells.size} {pluralCells(cells.size)}</span>
            </>
          ) : status === 'unavailable' || (raw && !orgId) ? (
            <span className="text-ink-300">Mapa niedostępna</span>
          ) : (
            <span className="text-ink-300">Wybierz organizację</span>
          )}
          {hover ? <span className="text-sun">{cellLabel(hover.x, hover.y)}</span> : null}
        </div>
      </div>
    </div>
  );
}
