import { generateRegister } from '../data/generator/generateRegister.ts';
import type { Register } from '../domain/model/register.ts';

/**
 * The demo register, in one place.
 *
 * The separate window rebuilds the register from these options instead of
 * receiving it through the URL — the generator is seeded, so the same options
 * always produce byte-identical data. Two windows therefore show the same
 * register without anything having to be serialised or kept in sync.
 */
export const DEMO_SEED = 42;

export function buildDemoRegister(withFaults: boolean): Register {
  return generateRegister({
    seed: DEMO_SEED,
    contractCount: 3,
    maxDepth: 4,
    faults: withFaults
      ? { rankDeviations: 2, cycles: 1, orphans: 1, danglingReferences: 1, missingRanks: 1 }
      : undefined,
  });
}

/**
 * A deliberately large register for the radial view: one contract with a hundred
 * providers, which is what the layered diagram can no longer show usefully.
 */
export function buildLargeDemoRegister(): Register {
  return generateRegister({
    seed: 11,
    contractCount: 1,
    maxDepth: 6,
    maxBranching: 5,
    providerPoolSize: 100,
  });
}
