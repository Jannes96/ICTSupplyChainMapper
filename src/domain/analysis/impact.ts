import type { Rank } from '../graph/computeRanks.ts';
import { reachableFrom } from '../graph/reachableFrom.ts';
import type { ContractRef, NodeId } from '../model/ids.ts';
import type { ContractAnalysis } from './ContractAnalysis.ts';

/**
 * What hangs off a provider.
 *
 * The checks answer whether the register is correct. This answers what is in it:
 * if this provider stops, what stops with it? That question is asked of an
 * outsourcing register far more often than any consistency question, and the
 * graph could answer it all along — it only needed asking.
 *
 * It is deliberately computed across *all* contracts. A provider that sits in
 * one chain is a manageable dependency; the same provider carrying four chains
 * is a concentration, and that only becomes visible when the contracts are
 * looked at together.
 */

export interface ContractImpact {
  readonly contractRef: ContractRef;
  /** Where the provider sits in this chain. */
  readonly rank: Rank;
  /** Providers below it in this chain, nearest first. */
  readonly downstream: readonly NodeId[];
}

export interface ProviderImpact {
  readonly providerId: NodeId;
  /** Every contract the provider takes part in, in register order. */
  readonly contracts: readonly ContractImpact[];
  /**
   * Distinct providers affected across all contracts. Smaller than the sum of
   * the per-contract figures whenever the same subcontractor appears twice —
   * which is exactly the case worth not double-counting.
   */
  readonly downstream: readonly NodeId[];
}

export function analyseImpact(
  contracts: readonly ContractAnalysis[],
  providerId: NodeId,
): ProviderImpact {
  const involved: ContractImpact[] = [];
  const affected = new Set<NodeId>();

  for (const contract of contracts) {
    if (!contract.graph.hasNode(providerId)) continue;

    const downstream = reachableFrom(contract.graph, providerId);
    for (const id of downstream) affected.add(id);

    involved.push({
      contractRef: contract.ref,
      rank: contract.ranks.get(providerId) ?? null,
      downstream,
    });
  }

  return { providerId, contracts: involved, downstream: [...affected] };
}
