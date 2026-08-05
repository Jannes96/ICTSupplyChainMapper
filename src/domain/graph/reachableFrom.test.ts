import { describe, expect, it } from 'vitest';
import { nodeId } from '../model/ids.ts';
import { DirectedGraph } from './DirectedGraph.ts';
import { reachableFrom } from './reachableFrom.ts';

const n = nodeId;

function graphOf(edges: Array<[string, string]>): DirectedGraph {
  const graph = new DirectedGraph();
  for (const [from, to] of edges) graph.addEdge(n(from), n(to));
  return graph;
}

describe('reachableFrom', () => {
  it('follows the chain to its end', () => {
    const reached = reachableFrom(
      graphOf([
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ]),
      n('A'),
    );

    expect(reached).toEqual([n('B'), n('C'), n('D')]);
  });

  it('returns the nearer subcontractors first', () => {
    // Breadth first, so the list reads as "these depend on it directly, those
    // further down" rather than one branch at a time.
    const reached = reachableFrom(
      graphOf([
        ['A', 'B'],
        ['A', 'C'],
        ['B', 'D'],
        ['C', 'E'],
      ]),
      n('A'),
    );

    expect(reached.slice(0, 2)).toEqual([n('B'), n('C')]);
    expect(new Set(reached.slice(2))).toEqual(new Set([n('D'), n('E')]));
  });

  it('counts a provider reached on two routes only once', () => {
    const reached = reachableFrom(
      graphOf([
        ['A', 'B'],
        ['A', 'C'],
        ['B', 'D'],
        ['C', 'D'],
      ]),
      n('A'),
    );

    expect(reached).toHaveLength(3);
    expect(reached.filter((id) => id === n('D'))).toHaveLength(1);
  });

  it('looks forwards only — clients are not affected by their subcontractor', () => {
    const reached = reachableFrom(
      graphOf([
        ['FE', 'A'],
        ['A', 'B'],
      ]),
      n('A'),
    );

    expect(reached).toEqual([n('B')]);
    expect(reached).not.toContain(n('FE'));
  });

  it('terminates on a cycle and leaves the starting node out of it', () => {
    // A provider does not depend on itself. That the cycle exists at all is
    // reported elsewhere, as the defect it is.
    const reached = reachableFrom(
      graphOf([
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'A'],
      ]),
      n('A'),
    );

    expect(reached).toEqual([n('B'), n('C')]);
  });

  it('reports nothing for a provider without subcontractors', () => {
    expect(reachableFrom(graphOf([['A', 'B']]), n('B'))).toEqual([]);
  });

  it('reports nothing for a node the chain does not contain', () => {
    expect(reachableFrom(graphOf([['A', 'B']]), n('Z'))).toEqual([]);
  });
});
