import { TOGGLE_GROUPS } from '../../map/overlays';
import { useMapStore } from '../../store/mapStore';
import { Toggle } from '../ui/Toggle';
import { hasMapTiler } from '../../map/style';

/** Representative swatch colour for each toggle (matches the map styling). */
const SWATCHES: Record<string, string | undefined> = {
  population: '#22a884',
  'existing-freight': '#8a6d3b',
  'existing-rail': '#5b6b7a',
  'existing-metro': '#3a86a8',
  'existing-stations': '#cfd6de',
};

export function LayersPanel() {
  const visibility = useMapStore((s) => s.visibility);
  const toggle = useMapStore((s) => s.toggle);

  return (
    <div className="flex flex-col">
      {TOGGLE_GROUPS.map((group) => (
        <section key={group.group} className="border-b border-hairline px-3 py-2">
          <h3 className="mb-1 font-sans text-2xs font-semibold uppercase tracking-wider text-muted">
            {group.title}
          </h3>
          <div className="flex flex-col">
            {group.items.map((item) => (
              <Toggle
                key={item.key}
                label={item.label ?? item.key}
                swatch={SWATCHES[item.key]}
                checked={visibility[item.key] ?? item.defaultVisible}
                onChange={() => toggle(item.key)}
              />
            ))}
          </div>
        </section>
      ))}
      <p className="px-3 py-2 text-2xs leading-relaxed text-muted/70">
        Base map: {hasMapTiler ? 'MapTiler dataviz (vector)' : 'CARTO Positron (OSM raster)'}.
        Reference layers populate once seed data is imported.
      </p>
    </div>
  );
}
