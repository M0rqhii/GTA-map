import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type L from 'leaflet';
import { GtaMap } from '../map/GtaMap';
import { useGridLayer } from '../map/hooks';
import { usePublicMap } from '../state/usePublicMap';
import type { Cell } from '../state/orgReducer';
import { pluralCells } from '../lib/format';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS = 4000;

// Cells that appeared since the previous update glow for a moment, so viewers see the search move.
// Nothing glows on the first load.
function useFreshCells(cells: Map<number, Cell>, ready: boolean): Set<number> {
  const prev = useRef<Map<number, Cell> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!ready) {
      prev.current = null;
      return;
    }
    const before = prev.current;
    prev.current = cells;
    if (!before) return;
    const added: number[] = [];
    for (const key of cells.keys()) if (!before.has(key)) added.push(key);
    if (added.length === 0) return;
    setFresh((f) => new Set([...f, ...added]));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFresh(new Set()), FRESH_MS);
  }, [cells, ready]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return fresh;
}

// Stream overlay (`/?org=<id>&obs=1`): only the public map of one org, framed to the whole grid.
// Built to be read small in a corner of a stream: muted satellite image, no grid lines, searched areas
// as solid shapes, a compact tag in the empty ocean at the top left. `&label=0` hides the tag.
// Uses the same public data as the viewer page, never the session.
export function ObsOverlay() {
  const [params] = useSearchParams();
  const raw = params.get('org');
  const orgId = raw && UUID_RE.test(raw) ? raw : null;
  const showLabel = params.get('label') !== '0';
  const { orgs, cells, status, delay, live } = usePublicMap(orgId);
  const [map, setMap] = useState<L.Map | null>(null);
  const fresh = useFreshCells(cells, status === 'ready');
  const version = useMemo(() => ({}), [cells, fresh]);

  useGridLayer(map, { cells, neutral: true, gridLines: false, highlightUser: null, flashKeys: fresh }, version);
  useEffect(() => {
    map?.getContainer().classList.add('map-muted-strong');
  }, [map]);

  const org = orgs?.find((o) => o.id === orgId) ?? null;
  const unavailable = !orgId || status === 'unavailable' || (orgs !== null && !org);

  return (
    <div className="relative h-full overflow-hidden bg-[#111c29]">
      <GtaMap onReady={setMap} variant="overlay" />
      {showLabel || unavailable ? (
        <div className="pointer-events-none absolute left-[1.8vmin] top-[1.8vmin] z-[1000] max-w-[60%]">
          <div className="hud px-[1.8vmin] py-[1.3vmin]">
            {unavailable ? (
              <p className="font-mono text-[length:clamp(10px,2.8vmin,14px)] text-ink-300">Mapa niedostępna</p>
            ) : org ? (
              <>
                <p className="truncate font-display text-[length:clamp(12px,3.8vmin,22px)] font-semibold uppercase leading-none tracking-[0.06em] text-ink-100">
                  {org.name}
                </p>
                <p className="mt-[0.8vmin] flex items-center gap-x-[1.4vmin] whitespace-nowrap font-mono text-[length:clamp(9px,2.3vmin,12px)] uppercase leading-tight tracking-wider">
                  {delay === 0 ? (
                    live ? (
                      <span className="flex items-center gap-1 text-ok">
                        <span className="h-[0.7em] w-[0.7em] animate-pulse rounded-full bg-ok" />na żywo
                      </span>
                    ) : (
                      <span className="text-ink-400">○ łączenie</span>
                    )
                  ) : (
                    <span className="text-ink-200">⏱ −{delay} min</span>
                  )}
                  <span className="text-sun">{cells.size} {pluralCells(cells.size)}</span>
                </p>
              </>
            ) : (
              <p className="font-mono text-[length:clamp(10px,2.8vmin,14px)] text-ink-300">Wczytywanie…</p>
            )}
          </div>
        </div>
      ) : null}
      {showLabel ? (
        <p className="pointer-events-none absolute bottom-[1.2vmin] right-[1.8vmin] z-[1000] font-mono text-[length:clamp(8px,1.9vmin,11px)] uppercase tracking-[0.14em] text-ink-400/80">
          net-flow.pl
        </p>
      ) : null}
    </div>
  );
}
