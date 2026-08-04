import type { ContractRef, NodeId } from '../domain/model/ids.ts';
import type { Finding } from '../domain/validation/Finding.ts';
import type { ValidationReport } from '../domain/validation/validateRegister.ts';

/**
 * Where a finding sits in the diagram.
 *
 * The finding list and the chain were two separate halves until now: one could
 * read that a rank deviates and then had to go hunting for the node. This is the
 * missing direction — from a finding to the place it is about.
 */
export interface FindingFocus {
  readonly contractRef: ContractRef;
  readonly nodeIds: readonly NodeId[];
}

/**
 * The nodes a finding concerns. A cycle is about all the nodes along it; every
 * other finding is about one provider.
 */
export function nodesOf(finding: Finding): readonly NodeId[] {
  return finding.code === 'CYCLE_DETECTED' ? finding.cycle : [finding.providerId];
}

/**
 * Resolves a finding to a contract and its nodes, or `null` when there is
 * nothing to show.
 *
 * Findings about the master data name no contract — a duplicated identification
 * code is a defect of B_05.01, not of a chain. For those the first chain the
 * provider occurs in is used, which is the place a reader would want to look. A
 * provider that occurs in no chain at all cannot be located, and saying so by
 * leaving the entry unclickable is better than a click that does nothing.
 */
export function locateFinding(report: ValidationReport, finding: Finding): FindingFocus | null {
  const nodeIds = nodesOf(finding);
  if (nodeIds.length === 0) return null;

  if (finding.contractRef !== null) {
    return { contractRef: finding.contractRef, nodeIds };
  }

  const contract = report.contracts.find((candidate) =>
    nodeIds.some((id) => candidate.graph.hasNode(id)),
  );
  return contract ? { contractRef: contract.ref, nodeIds } : null;
}
