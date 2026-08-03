import type { NodeId } from '../model/ids.ts';
import type { DirectedGraph } from './DirectedGraph.ts';

export interface TopologicalSortResult {
  /**
   * Nodes in an order where every node appears after all of its predecessors.
   * Contains all nodes iff the graph is acyclic.
   */
  readonly order: readonly NodeId[];
  /**
   * Nodes that could not be ordered because they lie on a cycle or are reachable
   * only through one. Their rank is not defined.
   */
  readonly unresolved: readonly NodeId[];
}

/**
 * Kahn's algorithm.
 *
 * Repeatedly removes nodes whose predecessors have all been emitted. Whatever
 * remains when the queue runs dry is exactly the part of the graph that is
 * trapped behind a cycle — which is why this function doubles as the cheap
 * cycle *detector*; `findCycles` is only needed to name the offending nodes.
 */
export function topologicalSort(graph: DirectedGraph): TopologicalSortResult {
  const remainingInDegree = new Map<NodeId, number>();
  for (const node of graph.nodes) {
    remainingInDegree.set(node, graph.inDegree(node));
  }

  const queue: NodeId[] = graph.nodes.filter((node) => remainingInDegree.get(node) === 0);
  const order: NodeId[] = [];

  for (let head = 0; head < queue.length; head++) {
    const node = queue[head] as NodeId;
    order.push(node);

    for (const successor of graph.successors(node)) {
      const left = (remainingInDegree.get(successor) ?? 0) - 1;
      remainingInDegree.set(successor, left);
      if (left === 0) queue.push(successor);
    }
  }

  const emitted = new Set(order);
  const unresolved = graph.nodes.filter((node) => !emitted.has(node));

  return { order, unresolved };
}
