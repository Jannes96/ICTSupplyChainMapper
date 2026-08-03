import { describe, expect, it } from 'vitest';
import { link, makeRegister, provider, TEST_FINANCIAL_ENTITY } from '../../testing/registerBuilder.ts';
import { contractRef, nodeId } from '../model/ids.ts';
import type { Finding, FindingCode } from './Finding.ts';
import { validateRegister } from './validateRegister.ts';

const n = nodeId;

function codes(findings: readonly Finding[]): FindingCode[] {
  return findings.map((finding) => finding.code);
}

function only<TCode extends FindingCode>(
  findings: readonly Finding[],
  code: TCode,
): Array<Extract<Finding, { code: TCode }>> {
  return findings.filter((finding): finding is Extract<Finding, { code: TCode }> => finding.code === code);
}

/** Computed rank of a provider inside one contract. */
function rankOf(report: ReturnType<typeof validateRegister>, contract: string, providerId: string) {
  return report.contracts.find((c) => c.ref === contractRef(contract))?.ranks.get(n(providerId));
}

describe('validateRegister', () => {
  it('accepts a correct branching chain without any finding', () => {
    //        FE
    //       /  \
    //      A    B        rank 1
    //     / \    \
    //    C   D    E      rank 2
    const report = validateRegister(
      makeRegister([
        link('C1', 'A', null, 1),
        link('C1', 'B', null, 1),
        link('C1', 'C', 'A', 2),
        link('C1', 'D', 'A', 2),
        link('C1', 'E', 'B', 2),
      ]),
    );

    expect(report.findings).toEqual([]);
    expect(report.summary).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it('gives siblings at the same position the same rank', () => {
    const report = validateRegister(
      makeRegister([
        link('C1', 'A', null, 1),
        link('C1', 'C', 'A', 2),
        link('C1', 'D', 'A', 2),
        link('C1', 'E', 'A', 2),
      ]),
    );

    expect(report.findings).toEqual([]);
    expect([rankOf(report, 'C1', 'C'), rankOf(report, 'C1', 'D'), rankOf(report, 'C1', 'E')]).toEqual([2, 2, 2]);
  });

  it('ranks a provider per contract, so the same provider can sit at two positions', () => {
    // S is a direct provider in C1 and a sub-subcontractor in C2.
    const report = validateRegister(
      makeRegister([
        link('C1', 'S', null, 1),
        link('C2', 'A', null, 1),
        link('C2', 'B', 'A', 2),
        link('C2', 'S', 'B', 3),
      ]),
    );

    expect(report.findings).toEqual([]);
    expect(rankOf(report, 'C1', 'S')).toBe(1);
    expect(rankOf(report, 'C2', 'S')).toBe(3);
  });

  it('accepts a provider with two mandates in the same chain (a DAG, not a tree)', () => {
    // A and B both subcontract to D; the longest path decides: rank 3.
    const report = validateRegister(
      makeRegister([
        link('C1', 'A', null, 1),
        link('C1', 'B', 'A', 2),
        link('C1', 'D', 'B', 3),
        link('C1', 'D', 'A', 3),
      ]),
    );

    expect(report.findings).toEqual([]);
    expect(rankOf(report, 'C1', 'D')).toBe(3);
  });

  describe('rank deviation', () => {
    it('reports reported rank against computed rank', () => {
      const report = validateRegister(
        makeRegister([
          link('C1', 'A', null, 1),
          link('C1', 'B', 'A', 2),
          link('C1', 'C', 'B', 2), // reported 2, actually 3
        ]),
      );

      const deviations = only(report.findings, 'RANK_DEVIATION');
      expect(deviations).toHaveLength(1);
      expect(deviations[0]).toMatchObject({
        contractRef: contractRef('C1'),
        providerId: n('C'),
        reportedRank: 2,
        computedRank: 3,
        severity: 'error',
      });
    });

    it('catches a subcontractor wrongly reported as a direct provider', () => {
      const report = validateRegister(
        makeRegister([
          link('C1', 'A', null, 1),
          link('C1', 'B', 'A', 1), // contracted by A, so rank 2, not 1
        ]),
      );

      expect(only(report.findings, 'RANK_DEVIATION')[0]).toMatchObject({
        providerId: n('B'),
        reportedRank: 1,
        computedRank: 2,
      });
    });

    it('does not flag a provider that carries a different rank in another contract', () => {
      const report = validateRegister(
        makeRegister([
          link('C1', 'S', null, 1),
          link('C2', 'A', null, 1),
          link('C2', 'S', 'A', 2),
        ]),
      );

      expect(only(report.findings, 'RANK_DEVIATION')).toEqual([]);
    });

    it('reports a missing rank as a warning and offers the computed one', () => {
      const report = validateRegister(makeRegister([link('C1', 'A', null, null)]));

      expect(only(report.findings, 'MISSING_REPORTED_RANK')[0]).toMatchObject({
        providerId: n('A'),
        computedRank: 1,
        severity: 'warning',
      });
    });

    it('reports rows whose duplicates disagree about the rank', () => {
      const report = validateRegister(
        makeRegister([
          link('C1', 'A', null, 1),
          link('C1', 'B', 'A', 2),
          link('C1', 'D', 'A', 2),
          link('C1', 'D', 'B', 3), // same provider, contradicting ranks
        ]),
      );

      const deviations = only(report.findings, 'RANK_DEVIATION');
      expect(deviations).toHaveLength(1);
      expect(deviations[0]).toMatchObject({ providerId: n('D'), reportedRank: 2, computedRank: 3 });
    });
  });

  describe('referential integrity', () => {
    it('reports a chain row whose provider has no master data', () => {
      const report = validateRegister(makeRegister([link('C1', 'A', null, 1)], []));

      expect(only(report.findings, 'UNKNOWN_PROVIDER_REFERENCE')[0]).toMatchObject({
        providerId: n('A'),
        field: 'provider_id',
        severity: 'error',
      });
    });

    it('reports a dangling contracted_by', () => {
      const report = validateRegister(
        makeRegister([link('C1', 'A', null, 1), link('C1', 'B', 'GHOST', 2)], ['A', 'B']),
      );

      expect(only(report.findings, 'UNKNOWN_PROVIDER_REFERENCE')[0]).toMatchObject({
        providerId: n('GHOST'),
        field: 'contracted_by',
      });
    });

    it('does not treat the financial entity as a missing provider', () => {
      const report = validateRegister(
        makeRegister([link('C1', 'A', TEST_FINANCIAL_ENTITY.id, 1)], ['A']),
      );

      expect(only(report.findings, 'UNKNOWN_PROVIDER_REFERENCE')).toEqual([]);
    });

    it('reports each unknown code once per contract, not once per row', () => {
      const report = validateRegister(
        makeRegister(
          [link('C1', 'A', null, 1), link('C1', 'B', 'GHOST', 2), link('C1', 'C', 'GHOST', 2)],
          ['A', 'B', 'C'],
        ),
      );

      expect(only(report.findings, 'UNKNOWN_PROVIDER_REFERENCE')).toHaveLength(1);
    });
  });

  describe('cycles', () => {
    it('reports A → B → A and refuses to rank the nodes involved', () => {
      const report = validateRegister(
        makeRegister([
          link('C1', 'A', 'B', 1),
          link('C1', 'B', 'A', 2),
        ]),
      );

      const cycles = only(report.findings, 'CYCLE_DETECTED');
      expect(cycles).toHaveLength(1);
      expect(new Set(cycles[0]?.cycle)).toEqual(new Set([n('A'), n('B')]));

      expect(rankOf(report, 'C1', 'A')).toBeNull();
      expect(codes(report.findings)).toContain('RANK_NOT_COMPUTABLE');
    });

    it('keeps cycles of different contracts apart', () => {
      const report = validateRegister(
        makeRegister([
          link('C1', 'A', 'B', 1),
          link('C1', 'B', 'A', 2),
          link('C2', 'A', null, 1),
        ]),
      );

      const cycles = only(report.findings, 'CYCLE_DETECTED');
      expect(cycles).toHaveLength(1);
      expect(cycles[0]?.contractRef).toBe(contractRef('C1'));
      expect(rankOf(report, 'C2', 'A')).toBe(1);
    });
  });

  describe('orphans', () => {
    it('reports a subcontractor whose own mandate is not documented', () => {
      // B is contracted by X, but no row says who contracts X.
      const report = validateRegister(
        makeRegister([link('C1', 'A', null, 1), link('C1', 'B', 'X', 2)]),
      );

      const orphans = only(report.findings, 'ORPHAN_NODE');
      expect(orphans).toHaveLength(1);
      expect(orphans[0]).toMatchObject({ providerId: n('X'), contractRef: contractRef('C1') });
    });

    it('does not treat direct providers as orphans', () => {
      const report = validateRegister(makeRegister([link('C1', 'A', null, 1)]));

      expect(only(report.findings, 'ORPHAN_NODE')).toEqual([]);
    });
  });

  describe('master data', () => {
    it('reports a duplicated identification code', () => {
      const base = makeRegister([link('C1', 'A', null, 1)]);
      const report = validateRegister({ ...base, providers: [...base.providers, provider('A')] });

      expect(only(report.findings, 'DUPLICATE_PROVIDER')[0]).toMatchObject({ providerId: n('A'), occurrences: 2 });
    });

    it('mentions providers that appear in no chain', () => {
      const base = makeRegister([link('C1', 'A', null, 1)]);
      const report = validateRegister({ ...base, providers: [...base.providers, provider('Z')] });

      expect(only(report.findings, 'UNUSED_PROVIDER')[0]).toMatchObject({ providerId: n('Z'), severity: 'info' });
    });
  });

  it('sorts findings with the most severe first', () => {
    const base = makeRegister([link('C1', 'A', null, null)]);
    const report = validateRegister({ ...base, providers: [...base.providers, provider('Z')] });

    expect(codes(report.findings)).toEqual(['MISSING_REPORTED_RANK', 'UNUSED_PROVIDER']);
  });

  it('runs only the checks it is given', () => {
    const report = validateRegister(makeRegister([link('C1', 'A', null, 5)]), []);

    expect(report.findings).toEqual([]);
    expect(report.contracts).toHaveLength(1);
  });
});
