import { useEffect, useState } from 'react';
import { getHealth, API_BASE, type HealthResponse } from './lib/api';
import { MapView } from './map/MapView';
import { LayersPanel } from './components/panels/LayersPanel';
import { useMapStore } from './store/mapStore';
import { activeAttributions } from './lib/attribution';
import { formatDistance, formatLatLng, metersPerPixel } from './lib/format';
import { SchemeTree } from './components/scheme-tree/SchemeTree';
import { AccountControl } from './components/auth/AccountControl';
import { Toolbar } from './components/Toolbar';
import { PropertiesPanel } from './components/panels/PropertiesPanel';
import { AnalysisPanel } from './components/panels/AnalysisPanel';
import { ProfileStrip } from './components/profile/ProfileStrip';
import { useSchemeStore } from './store/schemeStore';
import { useEditorStore } from './store/editorStore';
import { useAnalysisStore } from './store/analysisStore';
import { useUiStore } from './store/uiStore';
import { getMap } from './map/MapView';
import type { LngLat } from './lib/geometry';

/**
 * TRANSITLAB application shell.
 *
 *   ┌───────────────── top bar (scheme title · API status) ────────────────┐
 *   │ left rail │            map canvas (MapLibre)        │ right panel     │
 *   │ layers /  │                                          │ properties +   │
 *   │ scheme    │                                          │ analysis       │
 *   ├───────────┴──────────── bottom strip ────────────────┴────────────────┤
 *   │ coordinate readout · zoom/scale · attribution                         │
 *   └───────────────────────────────────────────────────────────────────────┘
 */
export function App() {
  // Optional deep-link: ?scheme=ID[&line=ID] opens a scheme (and selects a line).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const schemeId = params.get('scheme');
    const lineId = params.get('line');
    if (!schemeId) return;
    void useSchemeStore
      .getState()
      .selectScheme(schemeId)
      .then(() => {
        if (!lineId) return;
        useEditorStore.getState().select({ type: 'line', lineId });
        if (params.get('analyze')) {
          void useAnalysisStore.getState().run(lineId);
          if (params.get('connectivity')) void useAnalysisStore.getState().runConnectivity(lineId);
        }
        const line = useSchemeStore.getState().activeScheme?.lines.find((l) => l.id === lineId);
        const coords = (line?.geom?.coordinates ?? []) as LngLat[];
        if (!coords.length) return;
        // Centre the map on the line once it has initialised.
        const fit = (tries: number) => {
          const map = getMap();
          if (!map) {
            if (tries > 0) setTimeout(() => fit(tries - 1), 500);
            return;
          }
          let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
          for (const [x, y] of coords) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          }
          map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 140, maxZoom: 13, duration: 0 });
        };
        fit(8);
      });
  }, []);

  const leftOpen = useUiStore((s) => s.leftOpen);
  const rightOpen = useUiStore((s) => s.rightOpen);
  const toggleLeft = useUiStore((s) => s.toggleLeft);
  const toggleRight = useUiStore((s) => s.toggleRight);

  return (
    <div className="flex h-full flex-col bg-chrome text-ink">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {leftOpen ? (
          <LeftRail />
        ) : (
          <ReopenTab side="left" label="Layers & scheme" onClick={toggleLeft} />
        )}
        <main className="relative min-w-0 flex-1 bg-[#0b0d10]">
          <MapView />
          <Toolbar />
          <ConnectionBanner />
          <ProfileStrip />
        </main>
        {rightOpen ? (
          <RightPanel />
        ) : (
          <ReopenTab side="right" label="Properties & analysis" onClick={toggleRight} />
        )}
      </div>
      <BottomStrip />
    </div>
  );
}

/** Shown over the map when the API can't be reached (e.g. no backend on a
 *  static deployment), explaining why the network/data/analysis are empty. */
function ConnectionBanner() {
  const reachable = useMapStore((s) => s.apiReachable);
  if (reachable !== false) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <div className="pointer-events-auto max-w-xl rounded-[4px] border border-danger/50 bg-surface/95 px-3 py-2 shadow-panel backdrop-blur">
        <p className="font-sans text-xs font-semibold text-danger">Can’t reach the API</p>
        <p className="mt-0.5 font-sans text-2xs text-muted">
          The base map loads, but the existing rail network, population, schemes and analysis all
          need the backend at{' '}
          <code className="font-mono text-ink">{API_BASE}</code>. Start it with{' '}
          <code className="font-mono text-ink">npm run dev</code>, or set{' '}
          <code className="font-mono text-ink">VITE_API_BASE</code> to a deployed API.
        </p>
      </div>
    </div>
  );
}

/** A thin vertical bar shown in place of a collapsed side panel. */
function ReopenTab({
  side,
  label,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${label} panel`}
      title={`Open ${label}`}
      className={`flex w-6 shrink-0 flex-col items-center justify-center gap-2 bg-surface text-muted hover:text-ink ${
        side === 'left' ? 'border-r border-hairline' : 'border-l border-hairline'
      }`}
    >
      <span className="font-mono text-xs">{side === 'left' ? '›' : '‹'}</span>
      <span
        className="font-sans text-2xs uppercase tracking-wider"
        style={{ writingMode: 'vertical-rl', transform: side === 'left' ? 'rotate(180deg)' : 'none' }}
      >
        {label}
      </span>
    </button>
  );
}

function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline bg-chrome px-4">
      <div className="flex items-baseline gap-3">
        <span className="font-sans text-sm font-extrabold tracking-[0.2em] text-ink">
          TRANSITLAB
        </span>
        <span className="font-mono text-2xs uppercase tracking-wider text-muted">
          transport planning studio
        </span>
      </div>
      <div className="flex items-center gap-4">
        <ServerStatus />
        <div className="h-4 w-px bg-hairline" />
        <AccountControl />
      </div>
    </header>
  );
}

function ServerStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setApiReachable = useMapStore((s) => s.setApiReachable);

  useEffect(() => {
    let active = true;
    const check = () => {
      getHealth()
        .then((h) => {
          if (!active) return;
          setHealth(h);
          setError(null);
          setApiReachable(h.status === 'ok');
        })
        .catch((e: Error) => {
          if (!active) return;
          setError(e.message);
          setApiReachable(false);
        });
    };
    check();
    // Re-poll so a backend that comes up (or goes down) later is reflected.
    const id = setInterval(check, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [setApiReachable]);

  const ok = health?.status === 'ok';
  const colour = error ? 'bg-danger' : ok ? 'bg-signal' : 'bg-caution';
  const label = error ? 'API offline' : ok ? 'API connected' : 'connecting…';

  return (
    <div className="flex items-center gap-2 font-mono text-2xs text-muted">
      <span className={`inline-block h-2 w-2 rounded-full ${colour}`} aria-hidden />
      <span>{label}</span>
      {health && (
        <span className="text-muted/70">
          · PostGIS {health.postgis} · pgRouting {health.pgrouting}
        </span>
      )}
    </div>
  );
}

function LeftRail() {
  const toggleLeft = useUiStore((s) => s.toggleLeft);
  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-hairline bg-surface lg:w-64 md:w-56">
      <PanelHeading onCollapse={toggleLeft} collapseLabel="Collapse layers panel">
        Layers
      </PanelHeading>
      <LayersPanel />
      <PanelHeading>Scheme</PanelHeading>
      <SchemeTree />
    </aside>
  );
}

function RightPanel() {
  const toggleRight = useUiStore((s) => s.toggleRight);
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-hairline bg-surface lg:w-80 md:w-72">
      <PanelHeading onCollapse={toggleRight} collapseLabel="Collapse properties panel" side="right">
        Properties
      </PanelHeading>
      <PropertiesPanel />
      <PanelHeading>Analysis</PanelHeading>
      <AnalysisPanel />
    </aside>
  );
}

function BottomStrip() {
  const cursor = useMapStore((s) => s.cursor);
  const zoom = useMapStore((s) => s.zoom);
  const visibility = useMapStore((s) => s.visibility);

  const lat = cursor?.lat ?? 54;
  const mpp = metersPerPixel(lat, zoom);
  const attributions = activeAttributions(visibility);

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-hairline bg-chrome px-4 font-mono text-2xs text-muted">
      <div className="flex items-center gap-4 whitespace-nowrap">
        <span className="tabular-nums">
          {cursor ? formatLatLng(cursor.lat, cursor.lng) : '——.———° N   ——.———° W'}
        </span>
        <span className="text-muted/70">z{zoom.toFixed(2)}</span>
        <span className="text-muted/70" title="ground resolution at cursor latitude">
          {formatDistance(mpp * 100)} / 100 px
        </span>
      </div>
      <div className="truncate text-right text-muted/70" title={attributions.join(' · ')}>
        {attributions.join(' · ')}
      </div>
    </footer>
  );
}

function PanelHeading({
  children,
  onCollapse,
  collapseLabel,
  side = 'left',
}: {
  children: React.ReactNode;
  onCollapse?: () => void;
  collapseLabel?: string;
  side?: 'left' | 'right';
}) {
  return (
    <h2 className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-surface px-3 py-2 font-sans text-2xs font-semibold uppercase tracking-wider text-muted">
      <span>{children}</span>
      {onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          aria-label={collapseLabel}
          title={collapseLabel}
          className="font-mono text-xs text-muted hover:text-ink"
        >
          {side === 'left' ? '‹' : '›'}
        </button>
      )}
    </h2>
  );
}
