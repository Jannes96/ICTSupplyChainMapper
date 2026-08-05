import type { NodeId } from '../model/ids.ts';
import type { DirectedGraph } from './DirectedGraph.ts';

/**
 * Every node reachable from `start` by following the edges forwards.
 *
 * In this register that means: everything that hangs off a provider — its
 * subcontractors, their subcontractors, and so on to the end of the chain. It is
 * the question an outsourcing manager actually asks about a provider, and the
 * counterpart to the rank, which measures the distance in the other direction.
 *
 * Breadth-first, so the result comes out in order of distance: the immediate
 * subcontractors first, the deepest last.
 *
 * `start` itself is never part of the result, not even when a cycle leads back to
 * it. A provider does not depend on itself; that a cycle exists is reported
 * elsewhere, as the defect it is.
 */
export function reachableFrom(graph: DirectedGraph, start: NodeId): NodeId[] {
  if (!graph.hasNode(start)) return [];

  const seen = new Set<NodeId>([start]);
  const queue: NodeId[] = [start];
  const reached: NodeId[] = [];

  for (let head = 0; head < queue.length; head++) {
    for (const successor of graph.successors(queue[head] as NodeId)) {
      if (seen.has(successor)) continue;
      seen.add(successor);
      reached.push(successor);
      queue.push(successor);
    }
  }

  return reached;
}
