import { describe, expect, it } from 'vitest';
import { nodeId } from '../model/ids.ts';
import { DirectedGraph } from './DirectedGraph.ts';
import { findCycles } from './findCycles.ts';

const n = nodeId;

function graphOf(edges: Array<[string, string]>): DirectedGraph {
  const graph = new DirectedGraph();
  for (const [from, to] of edges) graph.addEdge(n(from), n(to));
  return graph;
}

/** Rotation-invariant comparison — where a cycle "starts" is arbitrary. */
function asSets(cycles: ReadonlyArray<readonly string[]>): Array<Set<string>> {
  return cycles.map((cycle) => new Set(cycle));
}

describe('findCycles', () => {
  it('finds nothing in an acyclic chain', () => {
    expect(
      findCycles(
        graphOf([
          ['FE', 'A'],
          ['A', 'B'],
          ['A', 'C'],
          ['B', 'D'],
          ['C', 'D'],
        ]),
      ),
    ).toEqual([]);
  });

  it('finds A → B → A', () => {
    const cycles = findCycles(
      graphOf([
        ['FE', 'A'],
        ['A', 'B'],
        ['B', 'A'],
      ]),
    );

    expect(cycles).toHaveLength(1);
    expect(asSets(cycles)).toEqual([new Set(['A', 'B'])]);
  });

  it('finds a self-loop A → A', () => {
    expect(findCycles(graphOf([['A', 'A']]))).toEqual([[n('A')]]);
  });

  it('reports a cycle once regardless of the entry point', () => {
    const cycles = findCycles(
      graphOf([
        ['FE', 'A'],
        ['FE', 'B'],
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'A'],
      ]),
    );

    expect(cycles).toHaveLength(1);
    expect(asSets(cycles)).toEqual([new Set(['A', 'B', 'C'])]);
  });

  it('finds two independent cycles', () => {
    const cycles = findCycles(
      graphOf([
        ['A', 'B'],
        ['B', 'A'],
        ['X', 'Y'],
        ['Y', 'X'],
      ]),
    );

    expect(asSets(cycles)).toEqual([new Set(['A', 'B']), new Set(['X', 'Y'])]);
  });
});
