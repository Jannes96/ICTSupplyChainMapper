import { describe, expect, it } from 'vitest';
import { contractRef, nodeId } from '../domain/model/ids.ts';
import type { Finding } from '../domain/validation/Finding.ts';
import { validateRegister } from '../domain/validation/validateRegister.ts';
import { link, makeRegister, provider } from '../testing/registerBuilder.ts';
import { locateFinding, nodesOf } from './findingFocus.ts';

const n = nodeId;
const c = contractRef;

function findingOf(report: ReturnType<typeof validateRegister>, code: Finding['code']): Finding {
  const finding = report.findings.find((item) => item.code === code);
  if (!finding) throw new Error(`no ${code} in this report`);
  return finding;
}

describe('nodesOf', () => {
  it('names the single provider a finding is about', () => {
    const report = validateRegister(
      makeRegister([link('C1', 'A', null, 1), link('C1', 'B', 'A', 1)]),
    );

    expect(nodesOf(findingOf(report, 'RANK_DEVIATION'))).toEqual([n('B')]);
  });

  it('names every node along a cycle, not just one', () => {
    const report = validateRegister(
      makeRegister([link('C1', 'A', 'B', 1), link('C1', 'B', 'A', 2)]),
    );

    expect(new Set(nodesOf(findingOf(report, 'CYCLE_DETECTED')))).toEqual(
      new Set([n('A'), n('B')]),
    );
  });
});

describe('locateFinding', () => {
  it('sends a finding to the contract it names', () => {
    const report = validateRegister(
      makeRegister([
        link('C1', 'A', null, 1),
        link('C2', 'A', null, 1),
        link('C2', 'B', 'A', 1),
      ]),
    );

    expect(locateFinding(report, findingOf(report, 'RANK_DEVIATION'))).toEqual({
      contractRef: c('C2'),
      nodeIds: [n('B')],
    });
  });

  it('sends a master data finding to the first chain the provider occurs in', () => {
    // A duplicated code is a defect of B_05.01 and names no contract, but the
    // reader still wants to see where that provider sits.
    const base = makeRegister([link('C1', 'A', null, 1), link('C2', 'B', null, 1)]);
    const report = validateRegister({ ...base, providers: [...base.providers, provider('B')] });

    expect(locateFinding(report, findingOf(report, 'DUPLICATE_PROVIDER'))).toEqual({
      contractRef: c('C2'),
      nodeIds: [n('B')],
    });
  });

  it('cannot locate a provider that occurs in no chain', () => {
    // Exactly what UNUSED_PROVIDER means, so the entry stays unclickable rather
    // than offering a jump that leads nowhere.
    const base = makeRegister([link('C1', 'A', null, 1)]);
    const report = validateRegister({ ...base, providers: [...base.providers, provider('Z')] });

    expect(locateFinding(report, findingOf(report, 'UNUSED_PROVIDER'))).toBeNull();
  });

  it('locates a dangling reference, which has a node but no master data', () => {
    const report = validateRegister(
      makeRegister([link('C1', 'A', null, 1), link('C1', 'B', 'GHOST', 2)], ['A', 'B']),
    );

    expect(locateFinding(report, findingOf(report, 'UNKNOWN_PROVIDER_REFERENCE'))).toMatchObject({
      contractRef: c('C1'),
      nodeIds: [n('GHOST')],
    });
  });
});
