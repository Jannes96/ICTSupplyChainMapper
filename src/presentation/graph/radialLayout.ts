import type { NodeId } from '../../domain/model/ids.ts';
import type { LayoutGraph } from './layoutModel.ts';

/**
 * Radial Sankey layout, computed from scratch.
 *
 * The layered diagram runs out of room quickly: a contract with a hundred
 * subcontractors puts a hundred boxes on one line. Here the financial entity sits
 * at the centre and every rank is a ring, so the space available for a rank grows
 * with its distance from the centre — which is exactly where the nodes pile up.
 *
 * The Sankey part is the width: a band is as wide as the number of providers that
 * hang off it, the subcontractor itself included. If eighty of a hundred
 * providers sit behind a single direct provider, that one band takes eighty
 * percent of the circle. Concentration in the chain becomes a shape rather than a
 * number in a table.
 *
 * Bands are angular ranges rather than free-floating ribbons: a node's angular
 * span is divided among its children in proportion to their weight, so bands
 * partition their parent exactly and can never overlap or cross.
 */

export const INNER_RADIUS = 72;
export const RING_WIDTH = 108;
/** Radial thickness of the arc drawn for a node. */
export const NODE_THICKNESS = 26;

export interface RadialNode {
  readonly id: NodeId;
  /** Ring index. Nodes without a determinable rank get the outermost ring. */
  readonly ring: number;
  readonly rankIsKnown: boolean;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly midAngle: number;
  /** The node itself plus everything below it in the spanning tree. */
  readonly weight: number;
  /** Client in the spanning tree; `null` only for the centre. */
  readonly parent: NodeId | null;
}

export interface RadialRibbon {
  readonly id: string;
  readonly source: NodeId;
  readonly target: NodeId;
  /**
   * `false` for the second, third … client of a provider that is contracted more
   * than once in the same chain. Those relationships carry no subtree — the
   * weight is attributed to one client only — and are drawn as thin chords.
   */
  readonly isPrimary: boolean;
  readonly weight: number;
}

export interface RadialLayout {
  readonly nodes: readonly RadialNode[];
  readonly ribbons: readonly RadialRibbon[];
  readonly ringCount: number;
  readonly radius: number;
  /** Ancestors of a node up to the centre, nearest first. */
  readonly pathToCentre: (id: NodeId) => NodeId[];
}

export function radialLayout(graph: LayoutGraph): RadialLayout {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const centre = graph.nodes.find((node) => node.rank === 0) ?? graph.nodes[0];
  if (!centre) {
    return { nodes: [], ribbons: [], ringCount: 0, radius: 0, pathToCentre: () => [] };
  }

  const maxRank = graph.nodes.reduce((highest, node) => Math.max(highest, node.rank ?? 0), 0);
  // Nodes whose rank could not be determined have no ring of their own; they get
  // the one beyond the deepest rank, which keeps them visible without pretending
  // they belong to a level.
  const ringOf = (id: NodeId): number => byId.get(id)?.rank ?? maxRank + 1;

  const predecessors = new Map<NodeId, NodeId[]>();
  for (const edge of graph.edges) {
    const list = predecessors.get(edge.target);
    if (list) list.push(edge.source);
    else predecessors.set(edge.target, [edge.source]);
  }

  /**
   * Spanning tree: each node hangs off the client that sits deepest in the chain,
   * but strictly closer to the centre than the node itself. Requiring a smaller
   * ring keeps the tree acyclic even when the register contains a cycle, and
   * picking the deepest client matches the rank, which is the longest path.
   */
  const parentOf = new Map<NodeId, NodeId>();
  for (const node of graph.nodes) {
    if (node.id === centre.id) continue;

    const own = ringOf(node.id);
    let best: NodeId | null = null;
    for (const candidate of predecessors.get(node.id) ?? []) {
      if (ringOf(candidate) >= own) continue;
      if (best === null || ringOf(candidate) > ringOf(best)) best = candidate;
    }
    // A node whose every client sits at the same depth — inside a cycle, say —
    // has no usable client and is attached to the centre so it stays visible.
    parentOf.set(node.id, best ?? centre.id);
  }

  const children = new Map<NodeId, NodeId[]>();
  for (const [child, parent] of parentOf) {
    const list = children.get(parent);
    if (list) list.push(child);
    else children.set(parent, [child]);
  }

  const weights = new Map<NodeId, number>();
  const weightOf = (id: NodeId): number => {
    const cached = weights.get(id);
    if (cached !== undefined) return cached;
    // Reserve the slot first: the tree is acyclic by construction, but a corrupt
    // input must not turn into an endless recursion.
    weights.set(id, 1);
    const total = (children.get(id) ?? []).reduce((sum, child) => sum + weightOf(child), 1);
    weights.set(id, total);
    return total;
  };
  weightOf(centre.id);

  const nodes: RadialNode[] = [];
  const place = (id: NodeId, startAngle: number, endAngle: number): void => {
    const ring = id === centre.id ? 0 : ringOf(id);

    nodes.push({
      id,
      ring,
      rankIsKnown: byId.get(id)?.rank !== null,
      innerRadius: ring === 0 ? 0 : ringOuterRadius(ring) - NODE_THICKNESS,
      outerRadius: ring === 0 ? INNER_RADIUS : ringOuterRadius(ring),
      startAngle,
      endAngle,
      midAngle: (startAngle + endAngle) / 2,
      weight: weightOf(id),
      parent: parentOf.get(id) ?? null,
    });

    const own = children.get(id) ?? [];
    const total = own.reduce((sum, child) => sum + weightOf(child), 0);
    if (total === 0) return;

    let angle = startAngle;
    for (const child of own) {
      const span = ((endAngle - startAngle) * weightOf(child)) / total;
      place(child, angle, angle + span);
      angle += span;
    }
  };

  // Starting at -90° puts the first branch at twelve o'clock, where a reader looks.
  place(centre.id, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);

  const ribbons: RadialRibbon[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    isPrimary: parentOf.get(edge.target) === edge.source,
    weight: parentOf.get(edge.target) === edge.source ? weightOf(edge.target) : 1,
  }));

  // Rings including the centre; one extra when unrankable nodes need a home.
  const ringCount = maxRank + (graph.nodes.some((node) => node.rank === null) ? 2 : 1);

  return {
    nodes,
    ribbons,
    ringCount,
    radius: ringOuterRadius(Math.max(0, ringCount - 1)),
    pathToCentre: (id) => {
      const path: NodeId[] = [];
      let current = parentOf.get(id);
      while (current !== undefined && !path.includes(current)) {
        path.push(current);
        if (current === centre.id) break;
        current = parentOf.get(current);
      }
      return path;
    },
  };
}

/**
 * Outer edge of a ring. Ring 0 is the centre disc; every further ring adds one
 * `RING_WIDTH`, of which `NODE_THICKNESS` is the arc and the rest is the gap the
 * band spans.
 */
export function ringOuterRadius(ring: number): number {
  return INNER_RADIUS + ring * RING_WIDTH;
}

/** Point on a circle around the origin. */
export function polar(radius: number, angle: number): [number, number] {
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

/**
 * Ring segment between two radii and two angles — used for both the node arcs and
 * the bands, which is what makes a band exactly as wide as its share of the ring.
 */
export function annularSector(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  // A full turn cannot be expressed as a single arc; leaving a hairline open is
  // invisible at any sane zoom level.
  const sweep = Math.min(endAngle - startAngle, Math.PI * 2 - 1e-6);
  const end = startAngle + sweep;
  const largeArc = sweep > Math.PI ? 1 : 0;

  const [outerStartX, outerStartY] = polar(outerRadius, startAngle);
  const [outerEndX, outerEndY] = polar(outerRadius, end);
  const [innerEndX, innerEndY] = polar(innerRadius, end);
  const [innerStartX, innerStartY] = polar(innerRadius, startAngle);

  return [
    `M ${round(outerStartX)} ${round(outerStartY)}`,
    `A ${round(outerRadius)} ${round(outerRadius)} 0 ${largeArc} 1 ${round(outerEndX)} ${round(outerEndY)}`,
    `L ${round(innerEndX)} ${round(innerEndY)}`,
    `A ${round(innerRadius)} ${round(innerRadius)} 0 ${largeArc} 0 ${round(innerStartX)} ${round(innerStartY)}`,
    'Z',
  ].join(' ');
}

/**
 * The band from a client to one of its subcontractors: the ring segment between
 * the two arcs, spanning exactly the subcontractor's angular share. Because that
 * share is proportional to the subcontractor's weight, the width of the band *is*
 * the number of providers behind it.
 */
export function ribbonPath(parent: RadialNode, child: RadialNode): string {
  return annularSector(parent.outerRadius, child.innerRadius, child.startAngle, child.endAngle);
}

/** Chord through the centre region, for a provider contracted more than once. */
export function chordPath(from: RadialNode, to: RadialNode): string {
  const [startX, startY] = polar(from.outerRadius, from.midAngle);
  const [endX, endY] = polar(to.innerRadius, to.midAngle);
  return `M ${round(startX)} ${round(startY)} Q 0 0 ${round(endX)} ${round(endY)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
