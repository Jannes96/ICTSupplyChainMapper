import { describe, expect, it } from 'vitest';
import { nodeId } from '../model/ids.ts';
import { DirectedGraph } from './DirectedGraph.ts';
import { computeRanks } from './computeRanks.ts';

const n = nodeId;
const ROOT = n('FE');

function graphOf(edges: Array<[string, string]>): DirectedGraph {
  const graph = new DirectedGraph();
  graph.addNode(ROOT);
  for (const [from, to] of edges) graph.addEdge(n(from), n(to));
  return graph;
}

describe('computeRanks', () => {
  it('gives the financial entity rank 0 and its direct providers rank 1', () => {
    const { ranks } = computeRanks(graphOf([['FE', 'A'], ['FE', 'B']]), ROOT);

    expect(ranks.get(ROOT)).toBe(0);
    expect(ranks.get(n('A'))).toBe(1);
    expect(ranks.get(n('B'))).toBe(1);
  });

  it('assigns the same rank to siblings at the same position', () => {
    const { ranks } = computeRanks(
      graphOf([
        ['FE', 'A'],
        ['A', 'B1'],
        ['A', 'B2'],
        ['A', 'B3'],
      ]),
      ROOT,
    );

    expect([ranks.get(n('B1')), ranks.get(n('B2')), ranks.get(n('B3'))]).toEqual([2, 2, 2]);
  });

  it('takes the longest path when a provider is reachable on several routes', () => {
    // FE → A → B → D  (rank 3) and FE → D directly (rank 1).
    // The deeper position wins: that is where the subcontracting risk sits.
    const { ranks } = computeRanks(
      graphOf([
        ['FE', 'A'],
        ['A', 'B'],
        ['B', 'D'],
        ['FE', 'D'],
      ]),
      ROOT,
    );

    expect(ranks.get(n('D'))).toBe(3);
  });

  it('handles a diamond, where two branches meet again', () => {
    const { ranks } = computeRanks(
      graphOf([
        ['FE', 'A'],
        ['A', 'B'],
        ['A', 'C'],
        ['B', 'D'],
        ['C', 'D'],
      ]),
      ROOT,
    );

    expect(ranks.get(n('D'))).toBe(3);
  });

  it('reports null for nodes without a path from the financial entity', () => {
    const graph = graphOf([['FE', 'A']]);
    graph.addEdge(n('X'), n('Y'));

    const { ranks } = computeRanks(graph, ROOT);

    expect(ranks.get(n('X'))).toBeNull();
    expect(ranks.get(n('Y'))).toBeNull();
  });

  it('reports null for every node on or behind a cycle instead of inventing a rank', () => {
    const graph = graphOf([
      ['FE', 'A'],
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
      ['C', 'D'],
    ]);

    const { ranks, unresolved } = computeRanks(graph, ROOT);

    expect(ranks.get(n('A'))).toBeNull();
    expect(ranks.get(n('D'))).toBeNull();
    expect(new Set(unresolved)).toEqual(new Set([n('A'), n('B'), n('C'), n('D')]));
    // The part of the graph before the cycle stays usable.
    expect(ranks.get(ROOT)).toBe(0);
  });

  it('is independent of the order in which the edges were added', () => {
    const forwards = computeRanks(
      graphOf([
        ['FE', 'A'],
        ['A', 'B'],
        ['B', 'C'],
      ]),
      ROOT,
    ).ranks;

    const backwards = computeRanks(
      graphOf([
        ['B', 'C'],
        ['A', 'B'],
        ['FE', 'A'],
      ]),
      ROOT,
    ).ranks;

    for (const id of ['FE', 'A', 'B', 'C']) {
      expect(backwards.get(n(id))).toBe(forwards.get(n(id)));
    }
  });
});
