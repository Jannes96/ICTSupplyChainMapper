import { describe, expect, it } from 'vitest';
import { nodeId } from '../../domain/model/ids.ts';
import { validateRegister } from '../../domain/validation/validateRegister.ts';
import { link, makeRegister, TEST_FINANCIAL_ENTITY } from '../../testing/registerBuilder.ts';
import { NODE_HEIGHT, NODE_WIDTH, RANK_SEPARATION, layoutGraph } from './dagreLayout.ts';
import { toLayoutGraph } from './layoutModel.ts';

const n = nodeId;

function positionsOf(links: Parameters<typeof makeRegister>[0], providerIds?: string[]) {
  const report = validateRegister(makeRegister(links, providerIds));
  const contract = report.contracts[0];
  if (!contract) throw new Error('register without contract');
  return layoutGraph(toLayoutGraph(report.register, contract, report.findings));
}

describe('layoutGraph', () => {
  it('turns the rank into the vertical layer', () => {
    const positions = positionsOf([
      link('C1', 'A', null, 1),
      link('C1', 'B', 'A', 2),
      link('C1', 'C', 'B', 3),
    ]);

    const step = NODE_HEIGHT + RANK_SEPARATION;
    expect(positions.get(TEST_FINANCIAL_ENTITY.id)?.y).toBe(0);
    expect(positions.get(n('A'))?.y).toBe(step);
    expect(positions.get(n('B'))?.y).toBe(2 * step);
    expect(positions.get(n('C'))?.y).toBe(3 * step);
  });

  it('puts siblings on one line and side by side', () => {
    const positions = positionsOf([
      link('C1', 'A', null, 1),
      link('C1', 'B', null, 1),
      link('C1', 'C', null, 1),
    ]);

    const siblings = ['A', 'B', 'C'].map((id) => positions.get(n(id)));
    expect(new Set(siblings.map((position) => position?.y)).size).toBe(1);

    const columns = siblings.map((position) => position?.x ?? 0).sort((a, b) => a - b);
    expect(new Set(columns).size).toBe(3);
    for (let index = 1; index < columns.length; index++) {
      const gap = (columns[index] as number) - (columns[index - 1] as number);
      expect(gap).toBeGreaterThanOrEqual(NODE_WIDTH);
    }
  });

  it('places a node reached on two routes at its longest-path rank, not the shorter one', () => {
    // FE → D directly and FE → A → B → D. The rank is 3, so the box belongs
    // three levels down even though dagre could draw it right under the root.
    const positions = positionsOf([
      link('C1', 'A', null, 1),
      link('C1', 'B', 'A', 2),
      link('C1', 'D', 'B', 3),
      link('C1', 'D', null, 3),
    ]);

    expect(positions.get(n('D'))?.y).toBe(3 * (NODE_HEIGHT + RANK_SEPARATION));
  });

  it('parks nodes without a determinable rank below the deepest layer', () => {
    const positions = positionsOf([link('C1', 'A', null, 1), link('C1', 'B', 'X', 2)]);

    // A sits at rank 1; X and B have no rank and land on the next layer down.
    const parked = 2 * (NODE_HEIGHT + RANK_SEPARATION);
    expect(positions.get(n('X'))?.y).toBe(parked);
    expect(positions.get(n('B'))?.y).toBe(parked);
    expect(positions.get(n('A'))?.y).toBe(NODE_HEIGHT + RANK_SEPARATION);
  });

  it('never lets two boxes on the same layer overlap', () => {
    // A → B → C → A leaves every provider unrankable, so they all share the
    // trailing layer — the case where dagre's own x coordinates collide.
    const positions = positionsOf([
      link('C1', 'A', 'C', 1),
      link('C1', 'B', 'A', 2),
      link('C1', 'C', 'B', 3),
      link('C1', 'D', 'B', 4),
    ]);

    const byLayer = new Map<number, number[]>();
    for (const position of positions.values()) {
      const row = byLayer.get(position.y) ?? [];
      row.push(position.x);
      byLayer.set(position.y, row);
    }

    for (const row of byLayer.values()) {
      const columns = [...row].sort((a, b) => a - b);
      for (let index = 1; index < columns.length; index++) {
        const gap = (columns[index] as number) - (columns[index - 1] as number);
        expect(gap).toBeGreaterThanOrEqual(NODE_WIDTH);
      }
    }

    // All four providers really are on one layer, otherwise the test proves nothing.
    expect(byLayer.get(NODE_HEIGHT + RANK_SEPARATION)).toHaveLength(4);
  });

  it('produces a position for every node', () => {
    const positions = positionsOf([link('C1', 'A', null, 1), link('C1', 'B', 'A', 2)]);

    expect(positions.size).toBe(3);
    for (const position of positions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }
  });

  it('is deterministic', () => {
    const links = [link('C1', 'A', null, 1), link('C1', 'B', null, 1), link('C1', 'C', 'A', 2)];

    expect([...positionsOf(links)]).toEqual([...positionsOf(links)]);
  });
});
