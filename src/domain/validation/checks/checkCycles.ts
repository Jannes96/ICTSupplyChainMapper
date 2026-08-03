import type { AnalysisContext } from '../../analysis/ContractAnalysis.ts';
import { findCycles } from '../../graph/findCycles.ts';
import type { Finding } from '../Finding.ts';

/**
 * Cycle detection per contract (A → B → A, including self-loops A → A).
 *
 * A cycle is always a data defect: subcontracting runs strictly away from the
 * financial entity. It also makes the rank undefined for every node on and behind
 * the cycle, which is why this is an error rather than a warning.
 */
export function checkCycles(context: AnalysisContext): Finding[] {
  const findings: Finding[] = [];

  for (const contract of context.contracts) {
    for (const cycle of findCycles(contract.graph)) {
      findings.push({
        code: 'CYCLE_DETECTED',
        severity: 'error',
        contractRef: contract.ref,
        cycle,
      });
    }
  }

  return findings;
}
