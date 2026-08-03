import dagre from '@dagrejs/dagre';
import type { NodeId } from '../../domain/model/ids.ts';
import type { LayoutGraph } from './layoutModel.ts';

/**
 * Geometry for the diagram, computed with dagre.
 *
 * Kept apart from the React component on purpose: this is a pure function from
 * the layout model to coordinates, so it is unit-testable without a DOM and
 * without React Flow. The component only renders what comes out of here.
 */

export const NODE_WIDTH = 236;
export const NODE_HEIGHT = 88;
/** Vertical gap between two ranks. */
export const RANK_SEPARATION = 96;
/** Horizontal gap between two nodes of the same rank. */
export const NODE_SEPARATION = 36;

export interface Position {
  readonly x: number;
  readonly y: number;
}

export type PositionMap = ReadonlyMap<NodeId, Position>;

/**
 * dagre supplies the horizontal *order* of the nodes — minimising edge crossings
 * is the part that is genuinely tedious to do by hand. Layer and spacing are
 * ours.
 *
 * The vertical position comes from the computed rank, never from dagre. dagre
 * derives its own layering from the edges and, for a node reachable on several
 * routes, may pick a shorter one. Rank here is defined as the longest path, and
 * the diagram has to show exactly the rank the check reported — otherwise a node
 * would sit on a different level than the finding claims.
 *
 * The horizontal spacing is ours for the same reason: dagre only keeps nodes
 * apart within its own layers, so wherever our layering differs from dagre's,
 * its x coordinates would let boxes overlap. Taking only the order from dagre and
 * spreading each layer evenly keeps the crossing minimisation and guarantees the
 * boxes never collide.
 *
 * Nodes without a determinable rank (cycle or broken chain) have no layer of
 * their own; they are parked one level below the deepest rank.
 */
export function layoutGraph(graph: LayoutGraph): PositionMap {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: 'TB',
    ranksep: RANK_SEPARATION,
    nodesep: NODE_SEPARATION,
    // Matches this tool's own definition of rank as closely as dagre can.
    ranker: 'longest-path',
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  const maxRank = graph.nodes.reduce((highest, node) => Math.max(highest, node.rank ?? 0), 0);

  const layers = new Map<number, NodeId[]>();
  for (const node of graph.nodes) {
    const layer = node.rank ?? maxRank + 1;
    const bucket = layers.get(layer);
    if (bucket) bucket.push(node.id);
    else layers.set(layer, [node.id]);
  }

  const positions = new Map<NodeId, Position>();

  for (const [layer, ids] of layers) {
    // dagre's x decides the order within the layer; the id breaks ties so the
    // result stays identical between runs.
    const ordered = [...ids].sort((a, b) => {
      const difference = (dagreGraph.node(a)?.x ?? 0) - (dagreGraph.node(b)?.x ?? 0);
      return difference !== 0 ? difference : (a as string).localeCompare(b as string);
    });

    const span = ordered.length * NODE_WIDTH + (ordered.length - 1) * NODE_SEPARATION;
    let x = -span / 2;

    for (const id of ordered) {
      positions.set(id, { x: Math.round(x), y: layer * (NODE_HEIGHT + RANK_SEPARATION) });
      x += NODE_WIDTH + NODE_SEPARATION;
    }
  }

  return positions;
}
