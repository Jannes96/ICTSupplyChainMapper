import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NodeId } from '../../domain/model/ids.ts';
import type { Rank } from '../../domain/graph/computeRanks.ts';
import type { LayoutGraph, LayoutNode } from '../graph/layoutModel.ts';
import type { RadialNode } from '../graph/radialLayout.ts';
import {
  annularSector,
  chordPath,
  labelCapacity,
  LABEL_CHARACTER_WIDTH,
  polar,
  radialLayout,
  ribbonPath,
  ringOuterRadius,
} from '../graph/radialLayout.ts';
import { FINDING_TITLES, formatRank } from '../i18n/de.ts';

interface RadialSankeyProps {
  readonly layout: LayoutGraph;
}

const LABEL_FONT_SIZE = 11;
const PADDING = 40;

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 12;
const ZOOM_STEP = 1.35;

interface Viewport {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

const RESET_VIEW: Viewport = { scale: 1, x: 0, y: 0 };

/**
 * The radial view.
 *
 * Geometry comes from `radialLayout`; this component draws it and adds what makes
 * a hundred providers navigable at all: following a single chain (hover), finding
 * a name (search), taking in one level at a time (rank highlighting) and getting
 * close enough to read the outer rings (zoom).
 */
export function RadialSankey({ layout }: RadialSankeyProps) {
  const [hovered, setHovered] = useState<NodeId | null>(null);
  const [query, setQuery] = useState('');
  const [selectedRanks, setSelectedRanks] = useState<ReadonlySet<string>>(new Set());
  const [view, setView] = useState<Viewport>(RESET_VIEW);
  // A provider with several clients gets a chord across the middle. With a
  // hundred nodes those chords bury the centre, so they stay off until asked for
  // — except on the node currently being followed, where they are the point.
  const [showSecondary, setShowSecondary] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number; view: Viewport } | null>(null);

  const geometry = useMemo(() => radialLayout(layout), [layout]);
  const byId = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout]);
  const placed = useMemo(() => new Map(geometry.nodes.map((node) => [node.id, node])), [geometry]);

  const hoverPath = useMemo(() => {
    if (hovered === null) return null;
    return new Set<NodeId>([hovered, ...geometry.pathToCentre(hovered)]);
  }, [hovered, geometry]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term === '') return null;
    return new Set(
      layout.nodes
        .filter(
          (node) =>
            node.label.toLowerCase().includes(term) || String(node.id).toLowerCase().includes(term),
        )
        .map((node) => node.id),
    );
  }, [query, layout]);

  const rankFilter = useMemo(() => {
    if (selectedRanks.size === 0) return null;
    return new Set(
      layout.nodes.filter((node) => selectedRanks.has(rankKey(node.rank))).map((node) => node.id),
    );
  }, [selectedRanks, layout]);

  /**
   * The three ways of emphasising a node combine rather than replace each other:
   * a rank can be lit up and a name searched at the same time, and hovering still
   * traces its chain through both.
   */
  const isFocusing = hoverPath !== null || matches !== null || rankFilter !== null;
  const isEmphasised = useCallback(
    (id: NodeId): boolean =>
      (hoverPath?.has(id) ?? false) || (matches?.has(id) ?? false) || (rankFilter?.has(id) ?? false),
    [hoverPath, matches, rankFilter],
  );

  const zoomAround = useCallback((factor: number, pointX: number, pointY: number) => {
    setView((current) => {
      const scale = clamp(current.scale * factor, MIN_ZOOM, MAX_ZOOM);
      // Keep the point under the cursor where it is: translate so that its
      // position in diagram coordinates maps to the same place on screen.
      const worldX = (pointX - current.x) / current.scale;
      const worldY = (pointY - current.y) / current.scale;
      return { scale, x: pointX - scale * worldX, y: pointY - scale * worldY };
    });
  }, []);

  // React attaches wheel listeners passively, which forbids preventDefault, so
  // the handler is registered by hand — otherwise the page scrolls while zooming.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const point = toDiagramPoint(svg, event.clientX, event.clientY);
      if (!point) return;
      zoomAround(Math.exp(-event.deltaY * 0.0015), point.x, point.y);
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  const zoomFromCentre = (factor: number): void => zoomAround(factor, 0, 0);

  const size = geometry.radius + PADDING;
  const detail = hovered === null ? null : byId.get(hovered);
  const detailPlacement = hovered === null ? null : placed.get(hovered);

  return (
    <div className="radial">
      <div className="radial__toolbar">
        <label className="select">
          Dienstleister suchen
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name oder Kennung"
          />
        </label>
        {matches && (
          <span className="radial__matches">
            {matches.size} Treffer{matches.size > 0 ? ' — hervorgehoben' : ''}
          </span>
        )}

        <label className="toggle">
          <input
            type="checkbox"
            checked={showSecondary}
            onChange={(event) => setShowSecondary(event.target.checked)}
          />
          Mehrfachbeauftragungen zeigen
        </label>

        <div className="radial__zoom">
          <button type="button" className="ghost" onClick={() => zoomFromCentre(ZOOM_STEP)}>
            Vergrößern
          </button>
          <button type="button" className="ghost" onClick={() => zoomFromCentre(1 / ZOOM_STEP)}>
            Verkleinern
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setView(RESET_VIEW)}
            disabled={view.scale === 1 && view.x === 0 && view.y === 0}
          >
            Ansicht zurücksetzen
          </button>
          <span className="radial__hint">{Math.round(view.scale * 100)} %</span>
        </div>
      </div>

      <div className="radial__ranks">
        <span className="radial__ranks-label">Rang hervorheben</span>
        {layout.layers.map((layer) => {
          const key = rankKey(layer.rank);
          const active = selectedRanks.has(key);
          return (
            <button
              key={key}
              type="button"
              className={active ? 'chip chip--active' : 'chip'}
              aria-pressed={active}
              onClick={() => setSelectedRanks(toggle(selectedRanks, key))}
            >
              {layer.rank === 0 ? 'Finanzunternehmen' : `Rang ${formatRank(layer.rank)}`}
              <span className="chip__count">{layer.nodes.length}</span>
            </button>
          );
        })}
        {selectedRanks.size > 0 && (
          <button type="button" className="ghost" onClick={() => setSelectedRanks(new Set())}>
            Auswahl aufheben
          </button>
        )}
      </div>

      <div className="radial__canvas">
        <svg
          ref={svgRef}
          viewBox={`${-size} ${-size} ${size * 2} ${size * 2}`}
          role="img"
          aria-label={`Lieferkette des Vertrags ${layout.contractRef} als radiales Sankey-Diagramm`}
          onPointerDown={(event) => {
            const point = toDiagramPoint(svgRef.current, event.clientX, event.clientY);
            if (!point) return;
            dragRef.current = { x: point.x, y: point.y, view };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = dragRef.current;
            if (!start) return;
            const point = toDiagramPoint(svgRef.current, event.clientX, event.clientY);
            if (!point) return;
            setView({
              scale: start.view.scale,
              x: start.view.x + (point.x - start.x),
              y: start.view.y + (point.y - start.y),
            });
          }}
          onPointerUp={(event) => {
            dragRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            <g className={isFocusing ? 'radial__stage radial__stage--focused' : 'radial__stage'}>
              {Array.from({ length: geometry.ringCount }, (_, ring) => (
                <circle key={ring} className="radial__ring" r={ringOuterRadius(ring)} />
              ))}

              {geometry.ribbons.map((ribbon) => {
                const parent = placed.get(ribbon.source);
                const child = placed.get(ribbon.target);
                if (!parent || !child) return null;

                const touchesHovered = ribbon.target === hovered || ribbon.source === hovered;
                if (!ribbon.isPrimary && !showSecondary && !touchesHovered) return null;

                // A band belongs to the node it feeds, so it lights up with it.
                const isLit = isEmphasised(ribbon.target);
                const className = [
                  'radial__ribbon',
                  ribbon.isPrimary ? '' : 'radial__ribbon--secondary',
                  isLit ? 'is-lit' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <path
                    key={ribbon.id}
                    className={className}
                    d={ribbon.isPrimary ? ribbonPath(parent, child) : chordPath(parent, child)}
                  >
                    <title>
                      {`${byId.get(ribbon.source)?.label ?? ribbon.source} → ${byId.get(ribbon.target)?.label ?? ribbon.target}` +
                        (ribbon.isPrimary
                          ? ` · ${ribbon.weight} nachgelagerte(r) Dienstleister`
                          : ' · zusätzliche Beauftragung')}
                    </title>
                  </path>
                );
              })}

              {geometry.nodes.map((node) => (
                <NodeArc
                  key={node.id}
                  node={node}
                  data={byId.get(node.id)}
                  isLit={isEmphasised(node.id)}
                  isMatch={matches?.has(node.id) ?? false}
                  onHover={setHovered}
                />
              ))}

              {geometry.nodes.map((node) => {
                const data = byId.get(node.id);
                if (!data || node.ring === 0) return null;
                return (
                  <ArcLabel
                    key={`label-${node.id}`}
                    node={node}
                    label={data.label}
                    scale={view.scale}
                  />
                );
              })}

              <CentreLabel
                label={byId.get(geometry.nodes[0]?.id ?? ('' as NodeId))?.label ?? ''}
                scale={view.scale}
              />
            </g>
          </g>
        </svg>

        {detail && detailPlacement && (
          <aside className="radial__detail">
            <h3>{detail.label}</h3>
            <dl>
              <dt>Kennung</dt>
              <dd className="mono">{detail.id}</dd>
              <dt>Berechneter Rang</dt>
              <dd>{formatRank(detail.rank)}</dd>
              {detail.country && (
                <>
                  <dt>Sitzland</dt>
                  <dd>{detail.country}</dd>
                </>
              )}
              <dt>Nachgelagert</dt>
              <dd>{detailPlacement.weight - 1} Dienstleister</dd>
            </dl>

            {detail.findingCodes.length > 0 && (
              <ul className="radial__findings">
                {detail.findingCodes.map((code) => (
                  <li key={code}>{FINDING_TITLES[code]}</li>
                ))}
              </ul>
            )}

            <p className="radial__path">
              {[detail.id, ...geometry.pathToCentre(detail.id)]
                .reverse()
                .map((id) => byId.get(id)?.label ?? id)
                .join(' → ')}
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

interface NodeArcProps {
  readonly node: RadialNode;
  readonly data: LayoutNode | undefined;
  readonly isLit: boolean;
  readonly isMatch: boolean;
  readonly onHover: (id: NodeId | null) => void;
}

function NodeArc({ node, data, isLit, isMatch, onHover }: NodeArcProps) {
  const className = [
    'radial__node',
    `radial__node--${data?.kind ?? 'provider'}`,
    data?.severity ? `radial__node--${data.severity}` : '',
    isLit ? 'is-lit' : '',
    isMatch ? 'is-match' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const shared = {
    className,
    onMouseEnter: () => onHover(node.id),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover(node.id),
    onBlur: () => onHover(null),
    tabIndex: 0,
  };

  const title = (
    <title>
      {`${data?.label ?? node.id} · Rang ${formatRank(data?.rank ?? null)} · ${node.weight - 1} nachgelagert`}
    </title>
  );

  if (node.ring === 0) {
    return (
      <circle {...shared} r={node.outerRadius}>
        {title}
      </circle>
    );
  }

  return (
    <path
      {...shared}
      d={annularSector(node.innerRadius, node.outerRadius, node.startAngle, node.endAngle)}
    >
      {title}
    </path>
  );
}

/**
 * A label sits tangentially inside the node's own ring segment, never radiating
 * outwards: a label on an inner ring would otherwise run straight across every
 * ring outside it. Whether it fits is decided by `labelCapacity`.
 */
function ArcLabel({
  node,
  label,
  scale,
}: {
  readonly node: RadialNode;
  readonly label: string;
  readonly scale: number;
}) {
  const fitting = labelCapacity(node, scale);
  if (fitting === 0) return null;

  const midRadius = (node.innerRadius + node.outerRadius) / 2;
  const [x, y] = polar(midRadius, node.midAngle);
  const degrees = ((((node.midAngle * 180) / Math.PI) % 360) + 360) % 360;
  // Tangent to the ring. Between 0° and 180° — the lower half, since y grows
  // downwards — the tangent would put the text on its head, so it is turned over.
  const flipped = degrees > 0 && degrees < 180;
  const rotation = degrees + (flipped ? -90 : 90);

  return (
    <text
      className="radial__label"
      x={x}
      y={y}
      fontSize={LABEL_FONT_SIZE / scale}
      transform={`rotate(${rotation} ${x} ${y})`}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {label.length > fitting ? `${label.slice(0, fitting - 1)}…` : label}
    </text>
  );
}

function CentreLabel({ label, scale }: { readonly label: string; readonly scale: number }) {
  const fitting = Math.floor((ringOuterRadius(0) * 1.7 * scale) / LABEL_CHARACTER_WIDTH);

  return (
    <text
      className="radial__centre-label"
      x={0}
      y={0}
      fontSize={(LABEL_FONT_SIZE + 1) / scale}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {label.length > fitting ? `${label.slice(0, Math.max(1, fitting - 1))}…` : label}
    </text>
  );
}

/** Ranks are grouped by a string key so that "not determinable" can be one too. */
function rankKey(rank: Rank): string {
  return rank === null ? 'unbestimmt' : String(rank);
}

function toggle(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Screen coordinates into the SVG's own coordinate system, before panning. */
function toDiagramPoint(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const matrix = svg?.getScreenCTM();
  if (!svg || !matrix) return null;
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}
