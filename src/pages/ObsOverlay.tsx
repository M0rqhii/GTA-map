import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type L from 'leaflet';
import { GtaMap } from '../map/GtaMap';
import { useGridLayer } from '../map/hooks';
import { usePublicMap } from '../state/usePublicMap';
import { pluralCells } from '../lib/format';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stream overlay (`/?org=<id>&obs=1`): only the public map of one org, framed to the whole grid.
// `&label=0` hides the name tag. Uses the same public data as the viewer page, never the session.
export function ObsOverlay() {
  const [params] = useSearchParams();
  const raw = params.get('org');
  const orgId = raw && UUID_RE.test(raw) ? raw : null;
  const showLabel = params.get('label') !== '0';
  const { orgs, cells, status, delay, live } = usePublicMap(orgId);
  const [map, setMap] = useState<L.Map | null>(null);

  useGridLayer(map, { cells, neutral: true, highlightUser: null }, cells);

  const org = orgs?.find((o) => o.id === orgId) ?? null;
  const unavailable = !orgId || status === 'unavailable' || (orgs !== null && !org);

  return (
    <div className="relative h-full overflow-hidden bg-[#143c6a]">
      <GtaMap onReady={setMap} variant="overlay" />
      {showLabel || unavailable ? (
        <div className="pointer-events-none absolute bottom-2 left-2 z-[1000]">
          <div className="hud flex items-center gap-3 px-3 py-1.5 font-mono text-[12px]">
            {unavailable ? (
              <span className="text-ink-300">Mapa niedostępna</span>
            ) : org ? (
              <>
                <span className="font-display text-[15px] font-semibold uppercase tracking-[0.08em] text-ink-100">{org.name}</span>
                <span className={delay === 0 ? (live ? 'text-ok' : 'text-ink-400') : 'text-ink-300'}>
                  {delay === 0 ? (live ? '● NA ŻYWO' : '○ ŁĄCZENIE') : `⏱ −${delay} MIN`}
                </span>
                <span className="text-ink-300">{cells.size} {pluralCells(cells.size)}</span>
              </>
            ) : (
              <span className="text-ink-300">Wczytywanie…</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
