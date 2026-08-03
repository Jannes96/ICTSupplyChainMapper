import { useMemo, useState } from 'react';
import type { NodeId } from '../../domain/model/ids.ts';
import type { LayoutGraph, LayoutNode } from '../graph/layoutModel.ts';
import type { RadialNode } from '../graph/radialLayout.ts';
import {
  annularSector,
  chordPath,
  polar,
  radialLayout,
  ribbonPath,
  ringOuterRadius,
} from '../graph/radialLayout.ts';
import { FINDING_TITLES, formatRank } from '../i18n/de.ts';

interface RadialSankeyProps {
  readonly layout: LayoutGraph;
}

/** Rough width of a character at the label font size, used to fit text into an arc. */
const CHARACTER_WIDTH = 5.9;
/** Shorter than this a label says nothing, so the arc is left to the hover. */
const MIN_LABEL_CHARACTERS = 6;
const PADDING = 40;

/**
 * The radial view.
 *
 * Geometry comes from `radialLayout`; this component draws it and adds the two
 * things that make a hundred providers navigable: hovering a node lights up its
 * whole path back to the financial entity and dims everything else, and the
 * search box marks every provider whose name matches. Without them a dense chart
 * is decorative rather than useful.
 */
export function RadialSankey({ layout }: RadialSankeyProps) {
  const [hovered, setHovered] = useState<NodeId | null>(null);
  const [query, setQuery] = useState('');
  // A provider with several clients gets a chord across the middle. With a
  // hundred nodes those chords bury the centre, so they stay off until asked for
  // — except on the node currently being followed, where they are the point.
  const [showSecondary, setShowSecondary] = useState(false);

  const geometry = useMemo(() => radialLayout(layout), [layout]);
  const byId = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout]);
  const placed = useMemo(
    () => new Map(geometry.nodes.map((node) => [node.id, node])),
    [geometry],
  );

  const highlighted = useMemo(() => {
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
        <span className="radial__hint">
          Auf einen Knoten zeigen, um seinen Weg zum Finanzunternehmen zu verfolgen.
        </span>
      </div>

      <div className="radial__canvas">
        <svg
          viewBox={`${-size} ${-size} ${size * 2} ${size * 2}`}
          role="img"
          aria-label={`Lieferkette des Vertrags ${layout.contractRef} als radiales Sankey-Diagramm`}
        >
          <g className={highlighted || matches ? 'radial__stage radial__stage--focused' : 'radial__stage'}>
            {Array.from({ length: geometry.ringCount }, (_, ring) => (
              <circle key={ring} className="radial__ring" r={ringOuterRadius(ring)} />
            ))}

            {geometry.ribbons.map((ribbon) => {
              const parent = placed.get(ribbon.source);
              const child = placed.get(ribbon.target);
              if (!parent || !child) return null;

              const isLit = highlighted?.has(ribbon.target) && highlighted.has(ribbon.source);
              const touchesHovered = ribbon.target === hovered || ribbon.source === hovered;
              if (!ribbon.isPrimary && !showSecondary && !touchesHovered) return null;

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
                isLit={highlighted?.has(node.id) ?? false}
                isMatch={matches?.has(node.id) ?? false}
                onHover={setHovered}
              />
            ))}

            {geometry.nodes.map((node) => {
              const data = byId.get(node.id);
              if (!data || node.ring === 0) return null;
              return <ArcLabel key={`label-${node.id}`} node={node} label={data.label} />;
            })}

            <CentreLabel label={byId.get(geometry.nodes[0]?.id ?? ('' as NodeId))?.label ?? ''} />
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
 * ring outside it. It is drawn only when the arc is long enough to hold it, which
 * is why the dense outer rings are read by hovering instead.
 */
function ArcLabel({ node, label }: { readonly node: RadialNode; readonly label: string }) {
  const midRadius = (node.innerRadius + node.outerRadius) / 2;
  const arcLength = (node.endAngle - node.startAngle) * midRadius;
  const fitting = Math.floor(arcLength / CHARACTER_WIDTH);
  if (fitting < MIN_LABEL_CHARACTERS) return null;

  const [x, y] = polar(midRadius, node.midAngle);
  const degrees = (((node.midAngle * 180) / Math.PI) % 360 + 360) % 360;
  // Tangent to the ring. Between 0° and 180° — the lower half, since y grows
  // downwards — the tangent would put the text on its head, so it is turned over.
  const flipped = degrees > 0 && degrees < 180;
  const rotation = degrees + (flipped ? -90 : 90);

  return (
    <text
      className="radial__label"
      x={x}
      y={y}
      transform={`rotate(${rotation} ${x} ${y})`}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {label.length > fitting ? `${label.slice(0, fitting - 1)}…` : label}
    </text>
  );
}

function CentreLabel({ label }: { readonly label: string }) {
  return (
    <text className="radial__centre-label" x={0} y={0} textAnchor="middle" dominantBaseline="middle">
      {label.length > 18 ? `${label.slice(0, 17)}…` : label}
    </text>
  );
}
