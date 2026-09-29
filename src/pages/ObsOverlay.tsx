import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type L from 'leaflet';
import { GtaMap } from '../map/GtaMap';
import { useGridLayer } from '../map/hooks';
import { usePublicMap } from '../state/usePublicMap';
import type { Cell } from '../state/orgReducer';
import { GRID } from '../lib/grid';

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

// Stream overlay (`/?org=<id>&obs=1`): only the public map of one org, cropped to the grid frame.
// Built to be read small in a corner of a stream: muted satellite image, no grid lines, searched areas
// as solid shapes. The map keeps the grid's proportions and sits centered; around it the page is
// transparent in OBS. `&label=0` hides the small net-flow.pl credit.
// Uses the same public data as the viewer page, never the session.
export function ObsOverlay() {
  const [params] = useSearchParams();
  const raw = params.get('org');
  const orgId = raw && UUID_RE.test(raw) ? raw : null;
  const showCredit = params.get('label') !== '0';
  const { orgs, cells, status } = usePublicMap(orgId);
  const [map, setMap] = useState<L.Map | null>(null);
  const fresh = useFreshCells(cells, status === 'ready');
  const version = useMemo(() => ({}), [cells, fresh]);

  useGridLayer(map, { cells, neutral: true, gridLines: false, highlightUser: null, flashKeys: fresh }, version);
  useEffect(() => {
    map?.getContainer().classList.add('map-muted-strong');
  }, [map]);

  // OBS browser sources (window.obsstudio) composite a transparent page over the scene.
  useEffect(() => {
    if (!('obsstudio' in window)) return;
    const root = document.documentElement;
    root.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return () => {
      root.style.background = '';
      document.body.style.background = '';
    };
  }, []);

  const org = orgs?.find((o) => o.id === orgId) ?? null;
  const unavailable = !orgId || status === 'unavailable' || (orgs !== null && !org);

  return (
    <div className="grid h-full place-items-center overflow-hidden">
      <div
        className="relative overflow-hidden"
        style={{ width: `min(100vw, calc(100vh * ${GRID.cols} / ${GRID.rows}))`, aspectRatio: `${GRID.cols} / ${GRID.rows}` }}
      >
        <GtaMap onReady={setMap} variant="overlay" />
        {unavailable ? (
          <div className="pointer-events-none absolute inset-0 z-[1000] grid place-items-center">
            <p className="hud px-[2.5vmin] py-[1.5vmin] font-mono text-[length:clamp(10px,3vmin,15px)] text-ink-300">Mapa niedostępna</p>
          </div>
        ) : null}
        {showCredit ? (
          <p className="pointer-events-none absolute bottom-[1.4%] right-[2.2%] z-[1000] font-mono text-[length:clamp(7px,1.7vmin,11px)] uppercase tracking-[0.14em] text-ink-400/80">
            net-flow.pl
          </p>
        ) : null}
      </div>
    </div>
  );
}
