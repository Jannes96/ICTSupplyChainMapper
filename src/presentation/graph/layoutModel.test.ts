import { describe, expect, it } from 'vitest';
import { nodeId } from '../../domain/model/ids.ts';
import { validateRegister } from '../../domain/validation/validateRegister.ts';
import { link, makeRegister, TEST_FINANCIAL_ENTITY } from '../../testing/registerBuilder.ts';
import { toLayoutGraph } from './layoutModel.ts';

const n = nodeId;

function layoutOf(register: Parameters<typeof validateRegister>[0]) {
  const report = validateRegister(register);
  const contract = report.contracts[0];
  if (!contract) throw new Error('register without contract');
  return toLayoutGraph(report.register, contract, report.findings);
}

describe('toLayoutGraph', () => {
  it('groups the nodes into layers by rank, financial entity first', () => {
    const layout = layoutOf(
      makeRegister([
        link('C1', 'A', null, 1),
        link('C1', 'B', null, 1),
        link('C1', 'C', 'A', 2),
      ]),
    );

    expect(layout.layers).toEqual([
      { rank: 0, nodes: [TEST_FINANCIAL_ENTITY.id] },
      { rank: 1, nodes: [n('A'), n('B')] },
      { rank: 2, nodes: [n('C')] },
    ]);
  });

  it('labels the root with the financial entity and providers with their legal name', () => {
    const layout = layoutOf(makeRegister([link('C1', 'A', null, 1)]));

    expect(layout.nodes.find((node) => node.id === TEST_FINANCIAL_ENTITY.id)).toMatchObject({
      kind: 'financial_entity',
      label: 'Testbank AG',
      rank: 0,
    });
    expect(layout.nodes.find((node) => node.id === n('A'))).toMatchObject({
      kind: 'provider',
      label: 'Provider A',
      rank: 1,
    });
  });

  it('marks a node without master data as unknown and falls back to its code', () => {
    const layout = layoutOf(makeRegister([link('C1', 'A', 'GHOST', 2)], ['A']));

    expect(layout.nodes.find((node) => node.id === n('GHOST'))).toMatchObject({
      kind: 'unknown',
      label: 'GHOST',
      country: null,
    });
  });

  it('puts nodes without a determinable rank into a trailing layer', () => {
    const layout = layoutOf(
      makeRegister([
        link('C1', 'A', null, 1),
        link('C1', 'B', 'X', 2),
      ]),
    );

    expect(layout.layers.at(-1)).toEqual({ rank: null, nodes: [n('X'), n('B')] });
  });

  it('attaches the finding codes to the nodes they concern', () => {
    const layout = layoutOf(
      makeRegister([
        link('C1', 'A', null, 1),
        link('C1', 'B', 'A', 1),
      ]),
    );

    expect(layout.nodes.find((node) => node.id === n('B'))?.findingCodes).toEqual(['RANK_DEVIATION']);
    expect(layout.nodes.find((node) => node.id === n('A'))?.findingCodes).toEqual([]);
  });

  it('colours a node by its most severe finding', () => {
    // B carries both a missing rank (warning) and, through X, no computable
    // rank (error). The error wins.
    const layout = layoutOf(
      makeRegister([
        link('C1', 'A', null, 1),
        link('C1', 'B', 'X', null),
      ]),
    );

    const flagged = layout.nodes.find((node) => node.id === n('B'));
    expect(flagged?.findingCodes).toContain('RANK_NOT_COMPUTABLE');
    expect(flagged?.severity).toBe('error');
    expect(layout.nodes.find((node) => node.id === n('A'))?.severity).toBeNull();
  });

  it('exposes one edge per relationship, with a stable id', () => {
    const layout = layoutOf(makeRegister([link('C1', 'A', null, 1), link('C1', 'B', 'A', 2)]));

    expect(layout.edges).toEqual([
      { id: 'C1:FE->A', source: TEST_FINANCIAL_ENTITY.id, target: n('A') },
      { id: 'C1:A->B', source: n('A'), target: n('B') },
    ]);
  });
});
