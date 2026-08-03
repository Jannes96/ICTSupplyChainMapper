import { describe, expect, it } from 'vitest';
import { validateRegister } from '../../domain/validation/validateRegister.ts';
import { generateRegister } from './generateRegister.ts';

const codesOf = (register: Parameters<typeof validateRegister>[0]) =>
  new Set(validateRegister(register).findings.map((finding) => finding.code));

describe('generateRegister', () => {
  it('is reproducible for a given seed and differs between seeds', () => {
    expect(generateRegister({ seed: 7 })).toEqual(generateRegister({ seed: 7 }));
    expect(generateRegister({ seed: 7 })).not.toEqual(generateRegister({ seed: 8 }));
  });

  it('produces a register whose reported ranks match the computed ones', () => {
    // The generator lays out the chains level by level and never calls the
    // ranking algorithm, so this is an independent expectation.
    for (const seed of [1, 2, 3, 17, 99]) {
      const report = validateRegister(generateRegister({ seed, contractCount: 4, maxDepth: 4 }));
      expect(report.summary.error, `seed ${seed}`).toBe(0);
    }
  });

  it('builds chains that branch and reach the requested depth', () => {
    const register = generateRegister({ seed: 5, contractCount: 2, maxDepth: 4, maxBranching: 3 });
    const report = validateRegister(register);

    const ranks = report.contracts.flatMap((contract) => [...contract.ranks.values()]);
    expect(Math.max(...ranks.map((rank) => rank ?? 0))).toBeGreaterThanOrEqual(3);

    const rankOne = register.links.filter((item) => item.contractedBy === null);
    expect(rankOne.length).toBeGreaterThan(1);
  });

  it('uses only synthetic identification codes', () => {
    const register = generateRegister({ seed: 11 });

    for (const provider of register.providers) {
      expect(provider.id).toMatch(/^TEST[A-Z0-9]{16}$/);
    }
    expect(register.financialEntity.id).toMatch(/^TEST/);
  });

  it('lets the same provider appear in several contracts', () => {
    const register = generateRegister({ seed: 3, contractCount: 5, providerPoolSize: 8 });

    const contractsByProvider = new Map<string, Set<string>>();
    for (const item of register.links) {
      const contracts = contractsByProvider.get(item.providerId) ?? new Set<string>();
      contracts.add(item.contractRef);
      contractsByProvider.set(item.providerId, contracts);
    }

    expect([...contractsByProvider.values()].some((contracts) => contracts.size > 1)).toBe(true);
  });

  describe('fault injection', () => {
    it('produces rank deviations on request', () => {
      expect(codesOf(generateRegister({ seed: 4, faults: { rankDeviations: 2 } }))).toContain('RANK_DEVIATION');
    });

    it('produces a cycle on request', () => {
      expect(codesOf(generateRegister({ seed: 4, maxDepth: 3, faults: { cycles: 1 } }))).toContain('CYCLE_DETECTED');
    });

    it('produces an orphan on request', () => {
      expect(codesOf(generateRegister({ seed: 6, maxDepth: 3, faults: { orphans: 1 } }))).toContain('ORPHAN_NODE');
    });

    it('produces a dangling reference on request', () => {
      expect(codesOf(generateRegister({ seed: 6, maxDepth: 3, faults: { danglingReferences: 1 } }))).toContain(
        'UNKNOWN_PROVIDER_REFERENCE',
      );
    });

    it('produces a missing rank on request', () => {
      expect(codesOf(generateRegister({ seed: 6, faults: { missingRanks: 1 } }))).toContain('MISSING_REPORTED_RANK');
    });

    it('leaves the register clean when no faults are requested', () => {
      expect(validateRegister(generateRegister({ seed: 4 })).summary.error).toBe(0);
    });
  });
});
