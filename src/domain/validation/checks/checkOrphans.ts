import type { AnalysisContext } from '../../analysis/ContractAnalysis.ts';
import type { Finding } from '../Finding.ts';

/**
 * Orphan detection: a node inside a chain that has no incoming edge and is not
 * the financial entity.
 *
 * In register terms this is a provider that is named as `contracted_by` by
 * somebody else but never gets a row of its own saying who contracts *it*. The
 * chain is torn: the subcontractor is documented, its mandate is not. Its rank is
 * therefore not determinable either.
 */
export function checkOrphans(context: AnalysisContext): Finding[] {
  const findings: Finding[] = [];

  for (const contract of context.contracts) {
    for (const node of contract.graph.nodes) {
      if (node === contract.root) continue;
      if (contract.graph.inDegree(node) > 0) continue;

      findings.push({
        code: 'ORPHAN_NODE',
        severity: 'error',
        contractRef: contract.ref,
        providerId: node,
      });
    }
  }

  return findings;
}
