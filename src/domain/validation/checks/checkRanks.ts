import type { AnalysisContext } from '../../analysis/ContractAnalysis.ts';
import type { NodeId } from '../../model/ids.ts';
import type { Finding } from '../Finding.ts';

/**
 * The central check: reported rank (B_05.02) against the rank derived from the
 * relationships.
 *
 * The comparison is per contract, so a provider that sits at rank 2 in one chain
 * and rank 3 in another is judged against the right number in each.
 *
 * Rows are grouped by (contract, provider) and the *distinct* reported ranks are
 * compared. A provider may legitimately have several rows in one chain when two
 * different providers subcontract to it; those rows must then agree on the rank.
 * If they do not, each divergent value produces its own finding.
 */
export function checkRanks(context: AnalysisContext): Finding[] {
  const findings: Finding[] = [];

  for (const contract of context.contracts) {
    const reportedByProvider = new Map<NodeId, Set<number | null>>();

    for (const link of contract.links) {
      const reported = reportedByProvider.get(link.providerId);
      if (reported) reported.add(link.reportedRank);
      else reportedByProvider.set(link.providerId, new Set([link.reportedRank]));
    }

    for (const [providerId, reportedRanks] of reportedByProvider) {
      const computedRank = contract.ranks.get(providerId) ?? null;

      for (const reportedRank of reportedRanks) {
        if (computedRank === null) {
          findings.push({
            code: 'RANK_NOT_COMPUTABLE',
            severity: 'error',
            contractRef: contract.ref,
            providerId,
            reportedRank,
          });
          continue;
        }

        if (reportedRank === null) {
          findings.push({
            code: 'MISSING_REPORTED_RANK',
            severity: 'warning',
            contractRef: contract.ref,
            providerId,
            computedRank,
          });
          continue;
        }

        if (reportedRank !== computedRank) {
          findings.push({
            code: 'RANK_DEVIATION',
            severity: 'error',
            contractRef: contract.ref,
            providerId,
            reportedRank,
            computedRank,
          });
        }
      }
    }
  }

  return findings;
}
