import { DirectedGraph } from '../graph/DirectedGraph.ts';
import type { Rank } from '../graph/computeRanks.ts';
import { computeRanks } from '../graph/computeRanks.ts';
import type { ContractRef, NodeId } from '../model/ids.ts';
import type { Provider, Register, SupplyChainLink } from '../model/register.ts';
import { contractsOf, providerIndex } from '../model/register.ts';

/** Everything derived from a register for one contractual arrangement. */
export interface ContractAnalysis {
  readonly ref: ContractRef;
  /** The financial entity — root of this chain, rank 0. */
  readonly root: NodeId;
  readonly links: readonly SupplyChainLink[];
  readonly graph: DirectedGraph;
  readonly ranks: ReadonlyMap<NodeId, Rank>;
  readonly unresolved: readonly NodeId[];
}

/** Read-only view every validation check receives. */
export interface AnalysisContext {
  readonly register: Register;
  readonly providers: ReadonlyMap<NodeId, Provider>;
  readonly contracts: readonly ContractAnalysis[];
}

/**
 * Builds one graph per contract.
 *
 * Rank is scoped to the contractual arrangement, not to the register as a whole:
 * B_05.02 describes a chain per contract, and the same provider legitimately sits
 * at rank 2 in one chain and at rank 3 in another. Keeping the graphs separate is
 * what makes that representable — a single merged graph would collapse both
 * positions into one number.
 *
 * Rows referencing providers without master data are *not* dropped here. They
 * become nodes like any other, so the chain stays visible and the referential
 * check can report them by name.
 */
export function analyzeContracts(register: Register): ContractAnalysis[] {
  const root = register.financialEntity.id;
  const linksByContract = new Map<ContractRef, SupplyChainLink[]>();

  for (const link of register.links) {
    const bucket = linksByContract.get(link.contractRef);
    if (bucket) bucket.push(link);
    else linksByContract.set(link.contractRef, [link]);
  }

  return contractsOf(register).map(({ ref }) => {
    const links = linksByContract.get(ref) ?? [];
    const graph = new DirectedGraph();
    graph.addNode(root);

    for (const link of links) {
      // No `contractedBy` means the financial entity contracts directly,
      // which is precisely what makes the provider rank 1.
      graph.addEdge(link.contractedBy ?? root, link.providerId);
    }

    const { ranks, unresolved } = computeRanks(graph, root);
    return { ref, root, links, graph, ranks, unresolved };
  });
}

export function buildContext(register: Register): AnalysisContext {
  return {
    register,
    providers: providerIndex(register),
    contracts: analyzeContracts(register),
  };
}
