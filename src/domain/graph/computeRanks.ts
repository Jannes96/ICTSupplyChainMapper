import type { NodeId } from '../model/ids.ts';
import type { DirectedGraph } from './DirectedGraph.ts';
import { topologicalSort } from './topologicalSort.ts';

/**
 * `null` means "not determinable": the node has no path from the financial
 * entity, or every path to it runs through a cycle. We never invent a number —
 * a wrong rank in a register is exactly the defect this tool exists to find.
 */
export type Rank = number | null;

export interface RankResult {
  readonly ranks: ReadonlyMap<NodeId, Rank>;
  readonly topologicalOrder: readonly NodeId[];
  /** Nodes trapped on or behind a cycle; their rank is `null`. */
  readonly unresolved: readonly NodeId[];
}

/**
 * Rank of every node = length of the **longest** path from the root.
 *
 * Longest, not shortest: if a provider is reached both directly (rank 1) and
 * through another provider (rank 2), the register must report the deeper
 * position — that is where the subcontracting risk actually sits. Taking the
 * maximum also makes rank monotone along every edge, which is what makes the
 * layered layout later on render without backward edges.
 *
 * Relaxing in topological order visits each node only after all of its
 * predecessors, so a single pass suffices: O(V + E).
 */
export function computeRanks(graph: DirectedGraph, root: NodeId): RankResult {
  const { order, unresolved } = topologicalSort(graph);

  const ranks = new Map<NodeId, Rank>(graph.nodes.map((node) => [node, null]));
  if (graph.hasNode(root)) ranks.set(root, 0);

  for (const node of order) {
    if (node === root) continue;

    let longest: number | null = null;
    for (const predecessor of graph.predecessors(node)) {
      const predecessorRank = ranks.get(predecessor);
      // A predecessor without a rank contributes no path from the root.
      if (predecessorRank === null || predecessorRank === undefined) continue;
      if (longest === null || predecessorRank > longest) longest = predecessorRank;
    }

    ranks.set(node, longest === null ? null : longest + 1);
  }

  return { ranks, topologicalOrder: order, unresolved };
}
