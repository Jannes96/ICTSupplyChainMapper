import { describe, expect, it } from 'vitest';
import { link, makeRegister, TEST_FINANCIAL_ENTITY } from '../../testing/registerBuilder.ts';
import { contractRef, nodeId } from '../model/ids.ts';
import { analyzeContracts } from './ContractAnalysis.ts';
import { analyseImpact } from './impact.ts';

const n = nodeId;
const c = contractRef;

function impactOf(links: Parameters<typeof makeRegister>[0], provider: string) {
  return analyseImpact(analyzeContracts(makeRegister(links)), n(provider));
}

describe('analyseImpact', () => {
  it('reports the whole chain below a provider, not just the next level', () => {
    const impact = impactOf(
      [link('C1', 'A', null, 1), link('C1', 'B', 'A', 2), link('C1', 'C', 'B', 3)],
      'A',
    );

    expect(impact.downstream).toEqual([n('B'), n('C')]);
  });

  it('gives the rank the provider holds in each contract', () => {
    // The same provider, once contracted directly and once two levels down.
    const impact = impactOf(
      [
        link('C1', 'S', null, 1),
        link('C2', 'A', null, 1),
        link('C2', 'B', 'A', 2),
        link('C2', 'S', 'B', 3),
      ],
      'S',
    );

    expect(impact.contracts.map((item) => [item.contractRef, item.rank])).toEqual([
      [c('C1'), 1],
      [c('C2'), 3],
    ]);
  });

  it('counts a subcontractor appearing in two chains once', () => {
    // The sum of the per-contract figures would say three; two providers are
    // actually affected, and that is the number a concentration rests on.
    const impact = impactOf(
      [
        link('C1', 'A', null, 1),
        link('C1', 'X', 'A', 2),
        link('C1', 'Y', 'A', 2),
        link('C2', 'A', null, 1),
        link('C2', 'X', 'A', 2),
      ],
      'A',
    );

    expect(impact.contracts).toHaveLength(2);
    expect(impact.contracts[0]?.downstream).toHaveLength(2);
    expect(impact.contracts[1]?.downstream).toHaveLength(1);
    expect(new Set(impact.downstream)).toEqual(new Set([n('X'), n('Y')]));
  });

  it('leaves out the contracts a provider has nothing to do with', () => {
    const impact = impactOf([link('C1', 'A', null, 1), link('C2', 'B', null, 1)], 'A');

    expect(impact.contracts.map((item) => item.contractRef)).toEqual([c('C1')]);
  });

  it('reports an empty result for a provider at the end of every chain', () => {
    const impact = impactOf([link('C1', 'A', null, 1), link('C1', 'B', 'A', 2)], 'B');

    expect(impact.contracts).toHaveLength(1);
    expect(impact.downstream).toEqual([]);
  });

  it('answers the question for the financial entity too — that is the whole register', () => {
    const impact = impactOf(
      [link('C1', 'A', null, 1), link('C1', 'B', 'A', 2), link('C2', 'D', null, 1)],
      TEST_FINANCIAL_ENTITY.id,
    );

    expect(impact.contracts).toHaveLength(2);
    expect(new Set(impact.downstream)).toEqual(new Set([n('A'), n('B'), n('D')]));
  });

  it('survives a cycle instead of running in circles', () => {
    const impact = impactOf([link('C1', 'A', 'B', 1), link('C1', 'B', 'A', 2)], 'A');

    expect(impact.downstream).toEqual([n('B')]);
  });
});
