import { describe, expect, it } from 'vitest';
import { validateRegister } from '../domain/validation/validateRegister.ts';
import { buildDemoRegister, buildLargeDemoRegister } from './demoRegister.ts';

describe('buildDemoRegister', () => {
  it('is free of findings without fault injection', () => {
    expect(validateRegister(buildDemoRegister(false)).summary.error).toBe(0);
  });

  it('carries the injected faults when asked', () => {
    expect(validateRegister(buildDemoRegister(true)).summary.error).toBeGreaterThan(0);
  });

  it('produces the same register in the main window and in the chain window', () => {
    // The separate window rebuilds the register from these options instead of
    // receiving it — that only works because the generator is seeded.
    expect(buildDemoRegister(true)).toEqual(buildDemoRegister(true));
  });
});

describe('buildLargeDemoRegister', () => {
  it('really contains a hundred providers in a single contract', () => {
    // The point of the radial view. If this ever shrinks, the demo stops
    // demonstrating anything.
    const report = validateRegister(buildLargeDemoRegister());
    const contract = report.contracts[0];

    expect(report.contracts).toHaveLength(1);
    expect(report.register.providers).toHaveLength(100);
    expect(contract?.graph.nodeCount).toBe(101);
  });

  it('reaches several ranks and stays consistent', () => {
    const report = validateRegister(buildLargeDemoRegister());
    const ranks = [...(report.contracts[0]?.ranks.values() ?? [])];

    expect(Math.max(...ranks.map((rank) => rank ?? 0))).toBeGreaterThanOrEqual(4);
    expect(report.summary.error).toBe(0);
  });
});
