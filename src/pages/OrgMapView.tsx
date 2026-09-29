import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type L from 'leaflet';
import * as api from '../lib/api';
import { cellKey, cellLabel, GRID, type CellXY } from '../lib/grid';
import { PIN_ICONS } from '../lib/pins';
import { errorMessage } from '../lib/errors';
import { relativeTime, type ActivityEntry } from '../lib/format';
import { useAuth } from '../auth/AuthProvider';
import { useOrg } from '../state/useOrg';
import type { Member, Pin } from '../state/orgReducer';
import { GtaMap } from '../map/GtaMap';
import { useGridLayer, useHoverOutline, useIsTouch } from '../map/hooks';
import { useMapPointer } from '../map/useMapPointer';
import { PinLayer } from '../map/PinLayer';
import { cellsBoundsToLatLng, imageToLatLng } from '../map/coords';
import { MembersPanel } from '../components/MembersPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { OrgSettings } from '../components/OrgSettings';
import { PinEditor } from '../components/PinEditor';
import { PinDetails } from '../components/PinDetails';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toasts';
import { Button, Signature, Splash, Wordmark } from '../components/ui';
import {
  IconBack, IconBrush, IconClock, IconEye, IconEyeOff, IconLogout, IconPanel, IconPin, IconSettings, IconShield, IconUser, IconUsers,
} from '../components/icons';

type Tab = 'members' | 'history' | 'settings';

function ToolButton({ label, active, onClick, children, to }: { label: string; active?: boolean; onClick?: () => void; children: ReactNode; to?: string }) {
  const cls = [
    'grid h-10 w-10 place-items-center border backdrop-blur transition-colors',
    active ? 'border-sun bg-sun text-ink-950' : 'border-ink-600 bg-ink-850/90 text-ink-100 hover:border-sun hover:text-sun',
  ].join(' ');
  if (to) return <Link to={to} className={cls} title={label} aria-label={label}>{children}</Link>;
  return <button type="button" className={cls} onClick={onClick} title={label} aria-label={label} aria-pressed={active}>{children}</button>;
}

export function OrgMapView({ orgId, readOnly }: { orgId: string; readOnly: boolean }) {
  const { me, refreshMe, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const isTouch = useIsTouch();
  const meId = me!.id;

  const ctl = useOrg(orgId, {
    meId,
    readOnly,
    onRemoved: () => {
      if (readOnly) navigate('/admin', { replace: true });
      else void refreshMe();
    },
  });
  const { state, status } = ctl;

  const [map, setMap] = useState<L.Map | null>(null);
  const [hover, setHover] = useState<CellXY | null>(null);
  const [highlightUser, setHighlightUser] = useState<string | null>(null);
  const [brushMode, setBrushMode] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [draftPin, setDraftPin] = useState<{ px: number; py: number } | null>(null);
  const [editingPin, setEditingPin] = useState<Pin | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [showPins, setShowPins] = useState(true);
  const [pinIcons, setPinIcons] = useState<Set<string>>(() => new Set(PIN_ICONS.map((i) => i.id)));
  const [filterOpen, setFilterOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('members');
  const [panelOpen, setPanelOpen] = useState(() => !isTouch);
  const [flash, setFlash] = useState<{ keys: Set<number>; n: number }>({ keys: new Set(), n: 0 });
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = !readOnly && state.org?.owner_id === meId;
  const colorOf = useCallback((id: string) => state.members.get(id)?.color ?? null, [state.members]);

  useGridLayer(map, { cells: state.cells, colorOf, highlightUser, flashKeys: flash.keys, neutral: false }, `${state.version}:${highlightUser}:${flash.n}`);
  useHoverOutline(map, hover);

  // Pins
  const pinLayer = useRef<PinLayer | null>(null);
  useEffect(() => {
    if (!map) return;
    const layer = new PinLayer(map, setSelectedPinId);
    pinLayer.current = layer;
    return () => {
      layer.destroy();
      pinLayer.current = null;
    };
  }, [map]);
  useEffect(() => {
    pinLayer.current?.sync(state.pins.values(), colorOf, { visible: showPins, icons: pinIcons, highlightUser });
  }, [map, state.pins, colorOf, showPins, pinIcons, highlightUser]);

  useEffect(() => {
    map?.getContainer().classList.toggle('map-pin-mode', pinMode);
  }, [map, pinMode]);

  useMapPointer(map, brushMode && !readOnly, {
    onHover: setHover,
    onClick: (cell, img) => {
      if (readOnly) return;
      if (pinMode) {
        setPinMode(false);
        if (img.x >= 0 && img.y >= 0 && img.x <= 8192 && img.y <= 8192) setDraftPin({ px: img.x, py: img.y });
        return;
      }
      setSelectedPinId(null);
      if (cell) ctl.toggleCell(cell.x, cell.y);
    },
    onBrushStart: (c) => !readOnly && !pinMode && ctl.brushStart(c),
    onBrushMove: ctl.brushMove,
    onBrushEnd: ctl.brushEnd,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPinMode(false);
      setSelectedPinId(null);
      setFilterOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const cellCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of state.cells.values()) counts.set(c.userId, (counts.get(c.userId) ?? 0) + 1);
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.version]);

  const members = useMemo(() => [...state.members.values()], [state.members]);

  const jump = useCallback((e: ActivityEntry) => {
    if (!map) return;
    const d = e.data ?? {};
    if (typeof d.minX === 'number') {
      map.flyToBounds(cellsBoundsToLatLng(d as { minX: number; minY: number; maxX: number; maxY: number }), { maxZoom: 5, padding: [60, 60], duration: 0.6 });
      let keys: number[] = [];
      if (Array.isArray(d.cells) && d.cells.length > 0) keys = (d.cells as [number, number][]).map(([x, y]) => cellKey(x, y));
      else if ((d.maxX - d.minX + 1) * (d.maxY - d.minY + 1) <= 500) {
        for (let y = d.minY; y <= d.maxY; y++) for (let x = d.minX; x <= d.maxX; x++) keys.push(cellKey(x, y));
      }
      setFlash((f) => ({ keys: new Set(keys), n: f.n + 1 }));
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash((f) => ({ keys: new Set(), n: f.n + 1 })), 2600);
    } else if (typeof d.px === 'number' && typeof d.py === 'number') {
      map.flyTo(imageToLatLng(d.px, d.py), Math.max(map.getZoom(), 5), { duration: 0.6 });
      if (typeof d.pin_id === 'string' && state.pins.has(d.pin_id)) setSelectedPinId(d.pin_id);
    }
    if (isTouch) setPanelOpen(false);
  }, [map, state.pins, isTouch]);

  const kick = useCallback(async (m: Member) => {
    const ok = await confirm({
      title: `Wyrzucić ${m.username}?`,
      message: 'Jego kwadraty i pinezki znikną z mapy. Może wrócić z kodem zaproszenia – jeśli nie chcesz, wygeneruj nowy kod w Ustawieniach.',
      confirmLabel: 'Wyrzuć',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.kickMember(m.id);
      toast.push(`${m.username} został wyrzucony`, 'ok');
    } catch (e) {
      toast.push(errorMessage(e), 'error');
    }
  }, [confirm, toast]);

  if (!state.loaded) {
    if (ctl.loadError) {
      return (
        <div className="grid h-full place-items-center p-6 text-center">
          <div>
            <p className="text-ink-200">{ctl.loadError}</p>
            <Button className="mt-4" onClick={() => void ctl.reload()}>Spróbuj ponownie</Button>
          </div>
        </div>
      );
    }
    return <Splash text="Wczytywanie mapy" />;
  }

  const org = state.org!;
  const hoverCell = hover ? state.cells.get(cellKey(hover.x, hover.y)) : undefined;
  const hoverOwner = hoverCell ? state.members.get(hoverCell.userId)?.username ?? 'były członek' : null;
  const selectedPin = selectedPinId ? state.pins.get(selectedPinId) : undefined;
  const markedTotal = state.cells.size;
  const coverage = Math.round((markedTotal / (GRID.cols * GRID.rows)) * 1000) / 10;

  return (
    <div className="relative h-full overflow-hidden bg-ink-950">
      <GtaMap onReady={setMap} leftInset={panelOpen ? 356 : 0} />

      {/* Banners */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-[1050] flex flex-col items-center gap-2 px-16">
        {readOnly ? (
          <div className="hud pointer-events-auto flex items-center gap-3 px-3 py-1.5 text-sm">
            <IconShield className="text-sun" />
            <span>Podgląd superadmina – tylko odczyt</span>
            <Link to="/admin" className="font-mono text-[12px] uppercase tracking-wider text-sun hover:underline">Wróć</Link>
          </div>
        ) : null}
        {status !== 'online' ? (
          <div className={`hud px-3 py-1.5 font-mono text-[12px] uppercase tracking-wider ${status === 'offline' ? 'text-danger' : 'text-ink-300'}`} role="status">
            {status === 'offline' ? '● Rozłączono – łączę ponownie…' : '○ Łączenie…'}
          </div>
        ) : null}
        {pinMode ? (
          <div className="hud pointer-events-auto px-3 py-1.5 text-sm text-sun">Kliknij w mapę, aby postawić pinezkę · Esc anuluje</div>
        ) : null}
      </div>

      {/* Side panel */}
      <aside
        className={[
          'hud absolute z-[1000] flex flex-col',
          'inset-x-0 bottom-0 max-h-[72vh] sm:inset-x-auto sm:bottom-4 sm:left-4 sm:top-4 sm:max-h-none sm:w-[340px]',
          panelOpen ? '' : 'hidden',
        ].join(' ')}
      >
        <header className="border-b border-ink-700 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <Wordmark size="sm" />
            <span className={`font-mono text-[11px] uppercase tracking-wider ${status === 'online' ? 'text-ok' : 'text-danger'}`}>
              {status === 'online' ? '● live' : '● offline'}
            </span>
          </div>
          <h1 className="mt-2 truncate font-display text-2xl font-semibold uppercase tracking-[0.06em] text-ink-100" title={org.name}>{org.name}</h1>
          <p className="font-mono text-[11px] text-ink-400">
            {markedTotal} przeszukanych · {coverage}% siatki{org.is_public ? ` · publiczna${org.public_delay_minutes ? ` (−${org.public_delay_minutes} min)` : ''}` : ''}
          </p>
        </header>
        <nav className="flex border-b border-ink-700" role="tablist">
          {([
            ['members', 'Członkowie', <IconUsers key="i" />],
            ['history', 'Historia', <IconClock key="i" />],
            ...(isOwner ? [['settings', 'Ustawienia', <IconSettings key="i" />]] : []),
          ] as [Tab, string, ReactNode][]).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={[
                'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 font-display text-[14px] font-semibold uppercase tracking-[0.1em] transition-colors',
                tab === id ? 'border-sun text-sun' : 'border-transparent text-ink-300 hover:text-ink-100',
              ].join(' ')}
            >
              {icon}{label}
            </button>
          ))}
        </nav>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
          {tab === 'members' ? (
            <MembersPanel
              members={members}
              cellCounts={cellCounts}
              online={state.online}
              ownerId={org.owner_id}
              meId={meId}
              canKick={isOwner}
              highlightUser={highlightUser}
              onHighlight={setHighlightUser}
              onKick={kick}
            />
          ) : tab === 'history' ? (
            <HistoryPanel entries={state.activity} done={state.activityDone} members={state.members} onLoadMore={ctl.loadMoreActivity} onJump={jump} />
          ) : isOwner ? (
            <OrgSettings org={org} />
          ) : null}
        </div>
        <footer className="shrink-0 border-t border-ink-700 px-4 py-2">
          <Signature />
        </footer>
      </aside>

      {/* Toolbar */}
      <nav className="absolute right-3 top-3 z-[1060] flex flex-col gap-1.5" aria-label="Narzędzia">
        <ToolButton label={panelOpen ? 'Ukryj panel' : 'Pokaż panel'} active={panelOpen && isTouch} onClick={() => setPanelOpen((o) => !o)}><IconPanel /></ToolButton>
        {!readOnly ? (
          <>
            <ToolButton label="Postaw pinezkę" active={pinMode} onClick={() => { setPinMode((p) => !p); setBrushMode(false); }}><IconPin /></ToolButton>
            <ToolButton label={brushMode ? 'Pędzel włączony' : 'Pędzel (lub Shift + przeciągnij)'} active={brushMode} onClick={() => { setBrushMode((b) => !b); setPinMode(false); }}><IconBrush /></ToolButton>
          </>
        ) : null}
        <div className="relative">
          <ToolButton label="Pinezki" active={filterOpen} onClick={() => setFilterOpen((f) => !f)}>{showPins ? <IconEye /> : <IconEyeOff />}</ToolButton>
          {filterOpen ? (
            <div className="hud absolute right-12 top-0 w-56 animate-rise p-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-[#f5b50a]" checked={showPins} onChange={(e) => setShowPins(e.target.checked)} />
                <span className="font-medium">Pokaż pinezki</span>
              </label>
              <div className="mt-2 space-y-1 border-t border-ink-700 pt-2">
                {PIN_ICONS.map((i) => (
                  <label key={i.id} className={`flex cursor-pointer items-center gap-2 text-sm ${showPins ? '' : 'opacity-40'}`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#f5b50a]"
                      disabled={!showPins}
                      checked={pinIcons.has(i.id)}
                      onChange={(e) => setPinIcons((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(i.id); else next.delete(i.id);
                        return next;
                      })}
                    />
                    <span>{i.emoji}</span><span>{i.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {readOnly ? (
          <ToolButton label="Wróć do panelu admina" to="/admin"><IconBack /></ToolButton>
        ) : (
          <>
            <ToolButton label="Konto" to="/konto"><IconUser /></ToolButton>
            {me!.is_superadmin ? <ToolButton label="Panel superadmina" to="/admin"><IconShield /></ToolButton> : null}
            <ToolButton label="Wyloguj" onClick={() => void signOut()}><IconLogout /></ToolButton>
          </>
        )}
      </nav>

      {/* Status bar */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-[1000] hidden -translate-x-1/2 sm:block">
        <div className="hud flex items-center gap-3 whitespace-nowrap px-4 py-2 font-mono text-[13px]">
          {hover ? (
            <>
              <span className="text-sun">{cellLabel(hover.x, hover.y)}</span>
              <span className="text-ink-300">
                {hoverCell ? `${hoverOwner} · ${relativeTime(new Date(hoverCell.at * 1000).toISOString())}` : 'wolny'}
              </span>
            </>
          ) : (
            <span className="text-ink-400">
              {readOnly ? 'Najedź na kwadrat, aby zobaczyć kto go zaznaczył' : 'Klik – zaznacz/odznacz · Shift + przeciągnij – pędzel'}
            </span>
          )}
          {highlightUser ? (
            <button type="button" className="pointer-events-auto text-sun hover:underline" onClick={() => setHighlightUser(null)}>
              · pokaż wszystkich
            </button>
          ) : null}
        </div>
      </div>

      {selectedPin ? (
        <PinDetails
          pin={selectedPin}
          author={state.members.get(selectedPin.user_id)}
          canEdit={!readOnly && selectedPin.user_id === meId}
          canDelete={!readOnly && (selectedPin.user_id === meId || isOwner)}
          onClose={() => setSelectedPinId(null)}
          onEdit={() => setEditingPin(selectedPin)}
          onDelete={async () => {
            const ok = await confirm({ title: 'Usunąć pinezkę?', message: selectedPin.body, confirmLabel: 'Usuń', danger: true });
            if (ok && (await ctl.deletePin(selectedPin.id))) setSelectedPinId(null);
          }}
        />
      ) : null}

      {draftPin ? (
        <PinEditor title="Nowa pinezka" onCancel={() => setDraftPin(null)} onSave={(icon, body) => ctl.addPin(draftPin.px, draftPin.py, icon, body)} />
      ) : null}
      {editingPin ? (
        <PinEditor
          title="Edytuj pinezkę"
          initial={{ icon: editingPin.icon, body: editingPin.body }}
          onCancel={() => setEditingPin(null)}
          onSave={(icon, body) => ctl.updatePin(editingPin, icon, body)}
        />
      ) : null}
    </div>
  );
}
