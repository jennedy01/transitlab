import { useEffect, useState } from 'react';
import { useSchemeStore } from '../../store/schemeStore';
import { useAuthStore } from '../../store/authStore';
import { useEditorStore } from '../../store/editorStore';
import { getMap } from '../../map/MapView';
import type { LngLat } from '../../lib/geometry';
import type { Line } from '@transitlab/shared';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/TextInput';
import { motionDuration } from '../../lib/motion';

export function SchemeTree() {
  const schemes = useSchemeStore((s) => s.schemes);
  const activeSchemeId = useSchemeStore((s) => s.activeSchemeId);
  const activeScheme = useSchemeStore((s) => s.activeScheme);
  const loadSchemes = useSchemeStore((s) => s.loadSchemes);
  const selectScheme = useSchemeStore((s) => s.selectScheme);
  const createScheme = useSchemeStore((s) => s.createScheme);
  const renameScheme = useSchemeStore((s) => s.renameScheme);
  const removeScheme = useSchemeStore((s) => s.removeScheme);
  const isAuthed = useAuthStore((s) => s.isAuthed);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // (Re)load the list on mount and whenever the account context changes. On
  // first run (no deep-link, nothing selected) open the most recent scheme so
  // the demo is visible immediately.
  useEffect(() => {
    void (async () => {
      await loadSchemes();
      const deepLinked = new URLSearchParams(window.location.search).get('scheme');
      const st = useSchemeStore.getState();
      if (!deepLinked && !st.activeSchemeId && st.schemes.length > 0) {
        await st.selectScheme(st.schemes[0].id);
      }
    })();
  }, [loadSchemes, isAuthed]);

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await createScheme(name);
    setNewName('');
    setCreating(false);
  }

  async function submitRename(id: string) {
    const name = editName.trim();
    if (name) await renameScheme(id, name);
    setEditingId(null);
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="font-mono text-2xs text-muted">{schemes.length} scheme(s)</span>
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="font-sans text-xs text-signal hover:text-signal/80"
        >
          + New
        </button>
      </div>

      {creating && (
        <form onSubmit={submitNew} className="flex gap-1 px-3 pb-2">
          <TextInput
            autoFocus
            placeholder="Scheme name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" variant="primary">
            Add
          </Button>
        </form>
      )}

      <ul className="flex flex-col">
        {schemes.map((scheme) => {
          const active = scheme.id === activeSchemeId;
          return (
            <li key={scheme.id}>
              {editingId === scheme.id ? (
                <div className="flex gap-1 px-3 py-1.5">
                  <TextInput
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitRename(scheme.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => void submitRename(scheme.id)}
                  />
                </div>
              ) : (
                <div
                  className={`group flex items-center justify-between gap-1 border-l-2 px-3 py-1.5 ${
                    active
                      ? 'border-signal bg-signal/10'
                      : 'border-transparent hover:bg-hairline/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void selectScheme(scheme.id)}
                    onDoubleClick={() => {
                      setEditingId(scheme.id);
                      setEditName(scheme.name);
                    }}
                    className="min-w-0 flex-1 truncate text-left font-sans text-xs text-ink"
                    title={`${scheme.name} — double-click to rename`}
                  >
                    {scheme.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${scheme.name}`}
                    onClick={() => {
                      if (confirm(`Delete scheme “${scheme.name}”? This cannot be undone.`)) {
                        void removeScheme(scheme.id);
                      }
                    }}
                    className="shrink-0 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Lines + stations within the active scheme. */}
              {active && (
                <div className="px-3 pb-2 pl-4">
                  {activeScheme && activeScheme.lines.length > 0 ? (
                    <ul className="flex flex-col">
                      {activeScheme.lines.map((line) => (
                        <SchemeTreeLine key={line.id} line={line} />
                      ))}
                    </ul>
                  ) : (
                    <p className="font-sans text-2xs text-muted/60">
                      No lines yet — use the Draw line tool on the map.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {schemes.length === 0 && !creating && (
          <li className="px-3 py-2 text-2xs text-muted/70">
            No schemes. Create one to start planning.
          </li>
        )}
      </ul>
    </div>
  );
}

function flyToLine(coords: LngLat[]): void {
  const map = getMap();
  if (!map || coords.length === 0) return;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  map.fitBounds(
    [
      [minX, minY],
      [maxX, maxY],
    ],
    { padding: 80, maxZoom: 14, duration: motionDuration(600) },
  );
}

function flyToPoint(coord: LngLat): void {
  const map = getMap();
  if (!map) return;
  map.flyTo({ center: coord, zoom: Math.max(map.getZoom(), 14), duration: motionDuration(600) });
}

/** A line node in the scheme tree, with its stations. */
function SchemeTreeLine({ line }: { line: Line }) {
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const coords = (line.geom?.coordinates ?? []) as LngLat[];

  const lineSelected = selection?.type === 'line' && selection.lineId === line.id;

  return (
    <li className="py-0.5">
      <button
        type="button"
        onClick={() => {
          select({ type: 'line', lineId: line.id });
          flyToLine(coords);
        }}
        className={`flex w-full items-center gap-2 rounded-[2px] px-1 py-0.5 text-left font-sans text-2xs ${
          lineSelected ? 'bg-signal/15 text-ink' : 'text-muted hover:text-ink'
        }`}
      >
        <span className="inline-block h-2 w-2 shrink-0 rounded-[1px]" style={{ backgroundColor: line.colour }} />
        <span className="truncate">{line.name}</span>
        <span className="ml-auto shrink-0 font-mono text-muted/60">{line.stations.length}●</span>
      </button>

      {line.stations.length > 0 && (
        <ul className="ml-3 border-l border-hairline pl-2">
          {line.stations.map((st) => {
            const stSelected = selection?.type === 'station' && selection.stationId === st.id;
            return (
              <li key={st.id}>
                <button
                  type="button"
                  onClick={() => {
                    select({ type: 'station', lineId: line.id, stationId: st.id });
                    flyToPoint(st.geom.coordinates as LngLat);
                  }}
                  className={`flex w-full items-center gap-1.5 py-0.5 text-left font-sans text-2xs ${
                    stSelected ? 'text-signal' : 'text-muted/80 hover:text-ink'
                  }`}
                >
                  <span className="text-muted/50">{st.isInterchange ? '◈' : '○'}</span>
                  <span className="truncate">{st.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
