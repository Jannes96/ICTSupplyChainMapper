import { describe, expect, it } from 'vitest';
import { nodeId } from '../model/ids.ts';
import { DirectedGraph } from './DirectedGraph.ts';
import { topologicalSort } from './topologicalSort.ts';

const n = nodeId;

function graphOf(edges: Array<[string, string]>): DirectedGraph {
  const graph = new DirectedGraph();
  for (const [from, to] of edges) graph.addEdge(n(from), n(to));
  return graph;
}

describe('topologicalSort', () => {
  it('orders every node after all of its predecessors', () => {
    const graph = graphOf([
      ['FE', 'A'],
      ['FE', 'B'],
      ['A', 'C'],
      ['B', 'C'],
      ['C', 'D'],
    ]);

    const { order, unresolved } = topologicalSort(graph);

    expect(unresolved).toEqual([]);
    expect(order).toHaveLength(5);

    const position = new Map(order.map((node, index) => [node, index]));
    for (const { from, to } of graph.edges) {
      expect(position.get(from)).toBeLessThan(position.get(to) as number);
    }
  });

  it('leaves nodes on a cycle unresolved', () => {
    const graph = graphOf([
      ['FE', 'A'],
      ['A', 'B'],
      ['B', 'A'],
    ]);

    const { order, unresolved } = topologicalSort(graph);

    expect(order).toEqual([n('FE')]);
    expect(new Set(unresolved)).toEqual(new Set([n('A'), n('B')]));
  });

  it('also holds back nodes that merely sit behind a cycle', () => {
    const graph = graphOf([
      ['A', 'B'],
      ['B', 'A'],
      ['B', 'C'],
    ]);

    expect(new Set(topologicalSort(graph).unresolved)).toEqual(new Set([n('A'), n('B'), n('C')]));
  });

  it('handles a graph without edges', () => {
    const graph = new DirectedGraph();
    graph.addNode(n('A'));

    expect(topologicalSort(graph)).toEqual({ order: [n('A')], unresolved: [] });
  });
});
