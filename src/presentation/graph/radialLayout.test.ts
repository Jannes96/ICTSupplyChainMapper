import { describe, expect, it } from 'vitest';
import { nodeId } from '../../domain/model/ids.ts';
import { validateRegister } from '../../domain/validation/validateRegister.ts';
import { link, makeRegister, TEST_FINANCIAL_ENTITY } from '../../testing/registerBuilder.ts';
import { toLayoutGraph } from './layoutModel.ts';
import {
  angularInset,
  annularSector,
  labelPlacement,
  MIN_LABEL_CHARACTERS,
  radialLayout,
} from './radialLayout.ts';

const n = nodeId;
const FULL_TURN = Math.PI * 2;

function layoutOf(links: Parameters<typeof makeRegister>[0], providerIds?: string[]) {
  const report = validateRegister(makeRegister(links, providerIds));
  const contract = report.contracts[0];
  if (!contract) throw new Error('register without contract');
  return radialLayout(toLayoutGraph(report.register, contract, report.findings));
}

const span = (node: { startAngle: number; endAngle: number }) => node.endAngle - node.startAngle;

describe('radialLayout', () => {
  it('puts the financial entity in the centre, spanning the full circle', () => {
    const layout = layoutOf([link('C1', 'A', null, 1)]);
    const centre = layout.nodes.find((node) => node.id === TEST_FINANCIAL_ENTITY.id);

    expect(centre?.ring).toBe(0);
    expect(centre?.innerRadius).toBe(0);
    expect(span(centre as { startAngle: number; endAngle: number })).toBeCloseTo(FULL_TURN);
  });

  it('places each rank on its own ring, further out', () => {
    const layout = layoutOf([
      link('C1', 'A', null, 1),
      link('C1', 'B', 'A', 2),
      link('C1', 'C', 'B', 3),
    ]);

    const rings = ['A', 'B', 'C'].map((id) => layout.nodes.find((node) => node.id === n(id)));

    expect(rings.map((node) => node?.ring)).toEqual([1, 2, 3]);
    expect(rings[0]?.outerRadius).toBeLessThan(rings[1]?.innerRadius as number);
    expect(rings[1]?.outerRadius).toBeLessThan(rings[2]?.innerRadius as number);
  });

  it('gives siblings of equal weight the same angular share', () => {
    const layout = layoutOf([
      link('C1', 'A', null, 1),
      link('C1', 'B', null, 1),
      link('C1', 'C', null, 1),
    ]);

    const shares = ['A', 'B', 'C'].map((id) =>
      span(layout.nodes.find((node) => node.id === n(id)) as { startAngle: number; endAngle: number }),
    );

    for (const share of shares) expect(share).toBeCloseTo(FULL_TURN / 3);
  });

  it('gives the heavier branch its proportional share of the circle', () => {
    // A carries three subcontractors, B none: A weighs 4, B weighs 1.
    const layout = layoutOf([
      link('C1', 'A', null, 1),
      link('C1', 'B', null, 1),
      link('C1', 'A1', 'A', 2),
      link('C1', 'A2', 'A', 2),
      link('C1', 'A3', 'A', 2),
    ]);

    const heavy = layout.nodes.find((node) => node.id === n('A'));
    const light = layout.nodes.find((node) => node.id === n('B'));

    expect(heavy?.weight).toBe(4);
    expect(light?.weight).toBe(1);
    expect(span(heavy as never)).toBeCloseTo((FULL_TURN * 4) / 5);
    expect(span(light as never)).toBeCloseTo((FULL_TURN * 1) / 5);
  });

  it('lets siblings partition their parent without gaps or overlap', () => {
    const layout = layoutOf([
      link('C1', 'A', null, 1),
      link('C1', 'A1', 'A', 2),
      link('C1', 'A2', 'A', 2),
    ]);

    const parent = layout.nodes.find((node) => node.id === n('A'));
    const children = ['A1', 'A2']
      .map((id) => layout.nodes.find((node) => node.id === n(id)))
      .sort((a, b) => (a?.startAngle ?? 0) - (b?.startAngle ?? 0));

    expect(children[0]?.startAngle).toBeCloseTo(parent?.startAngle as number);
    expect(children[0]?.endAngle).toBeCloseTo(children[1]?.startAngle as number);
    expect(children[1]?.endAngle).toBeCloseTo(parent?.endAngle as number);
  });

  it('hangs a provider with two clients off the deeper one', () => {
    // D is contracted by A (rank 1) and by B (rank 2); rank 3 follows from the
    // longer path, so the ring must be reached through B.
    const layout = layoutOf([
      link('C1', 'A', null, 1),
      link('C1', 'B', 'A', 2),
      link('C1', 'D', 'A', 3),
      link('C1', 'D', 'B', 3),
    ]);

    const d = layout.nodes.find((node) => node.id === n('D'));

    expect(d?.parent).toBe(n('B'));
    expect(d?.ring).toBe(3);
    // The second relationship is kept, but as a chord without angular weight.
    const secondary = layout.ribbons.filter((ribbon) => !ribbon.isPrimary);
    expect(secondary).toHaveLength(1);
    expect(secondary[0]?.source).toBe(n('A'));
  });

  it('gives unrankable nodes the outermost ring instead of a made-up rank', () => {
    const layout = layoutOf([link('C1', 'A', null, 1), link('C1', 'B', 'X', 2)]);

    const outermost = layout.ringCount - 1;
    expect(layout.nodes.find((node) => node.id === n('X'))?.ring).toBe(outermost);
    expect(layout.nodes.find((node) => node.id === n('X'))?.rankIsKnown).toBe(false);
    expect(layout.nodes.find((node) => node.id === n('A'))?.ring).toBe(1);
  });

  it('terminates on a cycle rather than looping through it', () => {
    const layout = layoutOf([link('C1', 'A', 'B', 1), link('C1', 'B', 'A', 2)]);

    // Neither node has a rank, so neither can be the other's client; both are
    // attached to the centre and stay visible.
    expect(layout.nodes.map((node) => node.id)).toContain(n('A'));
    expect(layout.nodes.map((node) => node.id)).toContain(n('B'));
    expect(layout.pathToCentre(n('A'))).toEqual([TEST_FINANCIAL_ENTITY.id]);
  });

  it('reports the path back to the centre', () => {
    const layout = layoutOf([
      link('C1', 'A', null, 1),
      link('C1', 'B', 'A', 2),
      link('C1', 'C', 'B', 3),
    ]);

    expect(layout.pathToCentre(n('C'))).toEqual([n('B'), n('A'), TEST_FINANCIAL_ENTITY.id]);
  });

  it('stays inside one turn with a hundred providers', () => {
    const links = Array.from({ length: 100 }, (_, index) =>
      link('C1', `P${index}`, index === 0 ? null : `P${Math.floor((index - 1) / 3)}`, null),
    );
    const layout = layoutOf(links);

    expect(layout.nodes).toHaveLength(101);

    const outer = layout.nodes.filter((node) => node.ring === 1);
    const covered = outer.reduce((sum, node) => sum + span(node), 0);
    expect(covered).toBeCloseTo(FULL_TURN);
  });
});

describe('labelPlacement', () => {
  /** A chain of `count` direct providers, each of which subcontracts once. */
  function crowdedLayout(count: number) {
    return layoutOf(
      Array.from({ length: count }, (_, index) => [
        link('C1', `P${index}`, null, 1),
        link('C1', `S${index}`, `P${index}`, 2),
      ]).flat(),
    );
  }

  it('writes an inner node along its ring', () => {
    const layout = crowdedLayout(3);
    const inner = layout.nodes.find((node) => node.ring === 1);

    expect(inner?.isLeaf).toBe(false);
    expect(labelPlacement(inner as never, 1, layout.radius).mode).toBe('tangential');
  });

  it('writes a leaf outwards, where the wedge belongs to nobody else', () => {
    const layout = crowdedLayout(3);
    const leaf = layout.nodes.find((node) => node.isLeaf);

    expect(labelPlacement(leaf as never, 1, layout.radius).mode).toBe('radial');
  });

  it('gives a leaf room for a full company name even on a crowded ring', () => {
    // The whole point: a leaf's arc may be a sliver, but the space outside it is
    // free, so the name does not have to be cut down to "Balti…".
    const layout = crowdedLayout(40);
    const leaf = layout.nodes.find((node) => node.isLeaf);

    expect(labelPlacement(leaf as never, 1, layout.radius).capacity).toBeGreaterThan(
      'Alpenblick Archive GmbH & Co. KG'.length,
    );
  });

  it('drops a leaf label when the wedge is not even one line tall', () => {
    const layout = crowdedLayout(400);
    const leaf = layout.nodes.find((node) => node.isLeaf);

    expect(labelPlacement(leaf as never, 1, layout.radius).capacity).toBe(0);
  });

  it('cuts an inner label the more siblings compete for the ring', () => {
    const roomy = crowdedLayout(3);
    const tight = crowdedLayout(40);

    expect(labelPlacement(roomy.nodes.find((n) => n.ring === 1) as never, 1, roomy.radius).capacity)
      .toBeGreaterThan(
        labelPlacement(tight.nodes.find((n) => n.ring === 1) as never, 1, tight.radius).capacity,
      );
  });

  it('reveals a label once the view is magnified far enough', () => {
    // The point of counter-scaling the font: zooming in has to uncover labels,
    // not merely enlarge the ones that already fitted.
    const layout = crowdedLayout(60);
    const inner = layout.nodes.find((node) => node.ring === 1);

    expect(labelPlacement(inner as never, 1, layout.radius).capacity).toBe(0);
    expect(labelPlacement(inner as never, 8, layout.radius).capacity).toBeGreaterThanOrEqual(
      MIN_LABEL_CHARACTERS,
    );
  });
});

describe('angularInset', () => {
  it('turns a pixel gap into an angle that shrinks with the radius', () => {
    expect(angularInset(0, 1, 100)).toBeGreaterThan(angularInset(0, 1, 400));
  });

  it('spares no gap where the slice is too narrow for one', () => {
    expect(angularInset(0, 0.001, 100)).toBe(0);
  });
});

describe('annularSector', () => {
  it('draws a closed ring segment', () => {
    const path = annularSector(10, 20, 0, Math.PI / 2);

    expect(path.startsWith('M ')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).toContain('A 20 20');
    expect(path).toContain('A 10 10');
  });

  it('marks the large-arc flag beyond a half turn', () => {
    expect(annularSector(10, 20, 0, Math.PI / 2)).toContain('0 0 1');
    expect(annularSector(10, 20, 0, Math.PI * 1.5)).toContain('0 1 1');
  });

  it('leaves a hairline open on a full turn, which SVG cannot draw as one arc', () => {
    const path = annularSector(10, 20, 0, Math.PI * 2);

    expect(path).not.toContain('NaN');
    expect(path.endsWith('Z')).toBe(true);
  });
});
