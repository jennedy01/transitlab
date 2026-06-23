import { useEditorStore } from '../../store/editorStore';
import { useSchemeStore } from '../../store/schemeStore';
import { useAnalysisStore, WALK_RADII } from '../../store/analysisStore';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

const fmtMoney = (m: number) => (m >= 1000 ? `£${(m / 1000).toFixed(2)} bn` : `£${Math.round(m)} m`);
const fmtTime = (s: number) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
const fmtNum = (n: number) => n.toLocaleString('en-GB');

export function AnalysisPanel() {
  const selection = useEditorStore((s) => s.selection);
  const activeScheme = useSchemeStore((s) => s.activeScheme);
  const { result, connectivity, walkRadiusM, running, runningConnectivity, error, lineId, run, runConnectivity, setWalkRadius } =
    useAnalysisStore();

  const selectedLineId = selection?.lineId ?? null;
  const line = selectedLineId
    ? activeScheme?.lines.find((l) => l.id === selectedLineId)
    : undefined;

  if (!line) {
    return (
      <p className="px-3 py-2 text-2xs text-muted">
        Select a line to evaluate its catchment, cost, journey time, coverage, and network
        connectivity.
      </p>
    );
  }

  const stale = lineId !== line.id;
  const showResult = result && !stale;

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="flex items-center gap-2">
        <Select
          aria-label="Walk radius"
          className="flex-1"
          value={String(walkRadiusM)}
          onChange={(e) => setWalkRadius(Number(e.target.value))}
          options={WALK_RADII.map((r) => ({ value: String(r), label: `${r} m walk` }))}
        />
        <Button variant="primary" onClick={() => run(line.id)} disabled={running}>
          {running ? 'Running…' : showResult ? 'Re-run' : 'Run analysis'}
        </Button>
      </div>

      {error && <p className="text-2xs text-danger">{error}</p>}

      {!showResult && !running && (
        <p className="text-2xs text-muted/70">
          {stale && result ? 'Results are for another line. ' : ''}Run analysis to evaluate this
          line.
        </p>
      )}

      {showResult && (
        <>
          {/* Catchment */}
          {result.catchment && (
            <Section title="Catchment population" caption={`${result.catchment.walkRadiusM} m walk`}>
              <Row label="Line total" value={fmtNum(result.catchment.lineTotalPopulation)} strong />
              <Row label="Unique (de-overlapped)" value={fmtNum(result.catchment.lineUniquePopulation)} />
              <div className="mt-1 flex flex-col gap-0.5 border-t border-hairline pt-1">
                {result.catchment.stations.map((s) => (
                  <Row key={s.stationId} label={s.name} value={fmtNum(s.population)} dim />
                ))}
              </div>
            </Section>
          )}

          {/* Cost */}
          {result.cost && (
            <Section
              title="Indicative capital cost"
              caption={`${result.cost.lengthKm} km · ${(result.cost.tunnelProportion * 100).toFixed(0)}% tunnel`}
            >
              <div
                className={`mb-1 font-mono text-lg ${result.cost.overThreshold ? 'text-danger' : 'text-ink'}`}
              >
                {fmtMoney(result.cost.total)}
              </div>
              <Row label="Per km" value={fmtMoney(result.cost.perKm)} />
              {result.cost.overThreshold && (
                <p className="my-1 rounded-[3px] bg-danger/10 px-2 py-1 text-2xs text-danger">
                  High tunnel proportion drives cost — flagged.
                </p>
              )}
              <div className="mt-1 flex flex-col gap-0.5 border-t border-hairline pt-1">
                {result.cost.breakdown.map((b, i) => (
                  <Row key={i} label={b.label} value={fmtMoney(b.subtotal)} dim />
                ))}
              </div>
            </Section>
          )}

          {/* Journey time */}
          {result.journeyTime && (
            <Section title="Journey time" caption={`${result.journeyTime.stops} stops`}>
              <Row label="End-to-end run time" value={fmtTime(result.journeyTime.runTimeS)} strong />
              <Row label="Average speed" value={`${result.journeyTime.averageSpeedKph} km/h`} />
              <Row label="Dwell per stop" value={`${result.journeyTime.dwellTimeS} s`} dim />
            </Section>
          )}

          {/* Coverage */}
          {result.coverage && (
            <Section title="Coverage overlap" caption={`${result.coverage.bufferM} m buffer`}>
              <Row
                label="Duplicates existing"
                value={`${result.coverage.duplicatedKm} km (${(result.coverage.duplicationProportion * 100).toFixed(0)}%)`}
                strong={result.coverage.duplicationProportion > 0.5}
              />
              <Row label="Serves uncovered ground" value={`${result.coverage.uncoveredKm} km`} />
              {result.coverage.duplicationProportion > 0.5 && (
                <p className="mt-1 rounded-[3px] bg-caution/10 px-2 py-1 text-2xs text-caution">
                  Over half the route parallels an existing line of the same mode (shown amber on the
                  map).
                </p>
              )}
            </Section>
          )}

          {/* Connectivity / missing links */}
          <Section title="Network connectivity" caption="missing links">
            <Button
              className="mb-1 w-full"
              onClick={() => runConnectivity(line.id)}
              disabled={runningConnectivity}
            >
              {runningConnectivity ? 'Routing the network…' : 'Find missing links'}
            </Button>
            {connectivity && (
              <ConnectivityReadout connectivity={connectivity} />
            )}
          </Section>
        </>
      )}

      <p className="border-t border-hairline pt-2 text-2xs leading-relaxed text-muted/60">
        All figures are indicative planning estimates, not forecasts.
      </p>
    </div>
  );
}

function ConnectivityReadout({
  connectivity,
}: {
  connectivity: ReturnType<typeof useAnalysisStore.getState>['connectivity'];
}) {
  if (!connectivity) return null;
  if (connectivity.links.length === 0) {
    return <p className="text-2xs text-muted/70">No poorly-connected centre pairs found nearby.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-2xs text-muted">
        Population centres near the scheme that are close but poorly connected by rail (amber
        desire-lines on the map):
      </p>
      {connectivity.links.map((l) => {
        const imp = connectivity.improvements.find((i) => i.linkId === l.id);
        return (
          <div key={l.id} className="rounded-[3px] border border-hairline px-2 py-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-sans text-2xs text-ink">
                {l.fromName} ↔ {l.toName}
              </span>
              <span className="shrink-0 font-mono text-2xs text-caution">×{l.detourRatio}</span>
            </div>
            <div className="font-mono text-2xs text-muted/70">
              {l.straightLineKm} km direct · {l.networkKm} km by rail
            </div>
            {imp && (
              <div className="mt-0.5 font-mono text-2xs text-signal">
                this line improves it by {imp.improvementPct}% (×{imp.beforeRatio} → ×{imp.afterRatio})
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[4px] border border-hairline bg-chrome/40 p-2">
      <div className="mb-1 flex items-baseline justify-between">
        <h4 className="font-sans text-2xs font-semibold uppercase tracking-wider text-muted">
          {title}
        </h4>
        {caption && <span className="font-mono text-2xs text-muted/60">{caption}</span>}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
  dim,
}: {
  label: string;
  value: string;
  strong?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`truncate font-sans text-2xs ${dim ? 'text-muted/70' : 'text-muted'}`}>
        {label}
      </span>
      <span className={`shrink-0 font-mono text-2xs tabular-nums ${strong ? 'text-ink' : dim ? 'text-muted/80' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  );
}
