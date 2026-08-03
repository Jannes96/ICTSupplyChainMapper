import type { AnalysisContext } from '../../analysis/ContractAnalysis.ts';
import type { NodeId } from '../../model/ids.ts';
import type { Finding } from '../Finding.ts';

/**
 * Master data hygiene in B_05.01, independent of any chain:
 *
 * - the same identification code described twice (the id must be unique — the
 *   whole graph relies on one code meaning one node),
 * - master data that no chain ever uses. Not an error: a provider can be under
 *   contract without subcontracting. Worth surfacing as a leftover, though.
 */
export function checkMasterData(context: AnalysisContext): Finding[] {
  const findings: Finding[] = [];

  const occurrences = new Map<NodeId, number>();
  for (const provider of context.register.providers) {
    occurrences.set(provider.id, (occurrences.get(provider.id) ?? 0) + 1);
  }

  for (const [providerId, count] of occurrences) {
    if (count > 1) {
      findings.push({
        code: 'DUPLICATE_PROVIDER',
        severity: 'warning',
        contractRef: null,
        providerId,
        occurrences: count,
      });
    }
  }

  const used = new Set<NodeId>();
  for (const link of context.register.links) {
    used.add(link.providerId);
    if (link.contractedBy !== null) used.add(link.contractedBy);
  }

  for (const providerId of occurrences.keys()) {
    if (!used.has(providerId)) {
      findings.push({
        code: 'UNUSED_PROVIDER',
        severity: 'info',
        contractRef: null,
        providerId,
      });
    }
  }

  return findings;
}
