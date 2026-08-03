import type { ContractAnalysis } from '../../domain/analysis/ContractAnalysis.ts';
import type { Rank } from '../../domain/graph/computeRanks.ts';
import type { NodeId } from '../../domain/model/ids.ts';
import type { Register } from '../../domain/model/register.ts';
import { providerIndex } from '../../domain/model/register.ts';
import type { Finding } from '../../domain/validation/Finding.ts';

/**
 * View model for the visualisation — prepared here, rendered later.
 *
 * This is the seam between domain and rendering: a pure, testable function turns
 * the analysis into flat node and edge lists. React Flow and dagre are not
 * imported anywhere in this repository yet; when they are, the adapter only has
 * to map `LayoutNode` → React Flow `Node` and feed `rank` to dagre as the layer
 * (`rankdir: 'TB'`, one dagre rank per DORA rank). Nothing in `domain/` changes,
 * and the layout stays unit-testable without a DOM.
 */

export type NodeKind = 'financial_entity' | 'provider' | 'unknown';

export interface LayoutNode {
  readonly id: NodeId;
  readonly label: string;
  readonly kind: NodeKind;
  /** Computed rank; drives the vertical layer. `null` renders outside the layers. */
  readonly rank: Rank;
  readonly country: string | null;
  /** Codes of the findings attached to this node — for highlighting. */
  readonly findingCodes: readonly Finding['code'][];
}

export interface LayoutEdge {
  readonly id: string;
  readonly source: NodeId;
  readonly target: NodeId;
}

export interface LayoutGraph {
  readonly contractRef: string;
  readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
  /** Node ids grouped by rank, ascending; `null` ranks come last. */
  readonly layers: ReadonlyArray<{ rank: Rank; nodes: readonly NodeId[] }>;
}

export function toLayoutGraph(
  register: Register,
  contract: ContractAnalysis,
  findings: readonly Finding[] = [],
): LayoutGraph {
  const providers = providerIndex(register);
  const findingCodesByNode = groupFindingCodes(findings, contract.ref);

  const nodes: LayoutNode[] = contract.graph.nodes.map((id) => {
    const provider = providers.get(id);
    const isRoot = id === contract.root;

    return {
      id,
      label: isRoot ? register.financialEntity.legalName : (provider?.legalName ?? String(id)),
      kind: isRoot ? 'financial_entity' : provider ? 'provider' : 'unknown',
      rank: contract.ranks.get(id) ?? null,
      country: isRoot ? register.financialEntity.country : (provider?.country ?? null),
      findingCodes: findingCodesByNode.get(id) ?? [],
    };
  });

  const edges: LayoutEdge[] = contract.graph.edges.map(({ from, to }) => ({
    id: `${contract.ref}:${from}->${to}`,
    source: from,
    target: to,
  }));

  return { contractRef: contract.ref, nodes, edges, layers: groupByRank(nodes) };
}

function groupByRank(nodes: readonly LayoutNode[]): Array<{ rank: Rank; nodes: NodeId[] }> {
  const ranked = new Map<number, NodeId[]>();
  const unranked: NodeId[] = [];

  for (const node of nodes) {
    if (node.rank === null) {
      unranked.push(node.id);
      continue;
    }
    const bucket = ranked.get(node.rank);
    if (bucket) bucket.push(node.id);
    else ranked.set(node.rank, [node.id]);
  }

  const layers = [...ranked.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rank, ids]) => ({ rank: rank as Rank, nodes: ids }));

  if (unranked.length > 0) layers.push({ rank: null, nodes: unranked });
  return layers;
}

function groupFindingCodes(
  findings: readonly Finding[],
  contractRef: string,
): Map<NodeId, Finding['code'][]> {
  const byNode = new Map<NodeId, Finding['code'][]>();

  const add = (id: NodeId, code: Finding['code']): void => {
    const codes = byNode.get(id);
    if (codes) {
      if (!codes.includes(code)) codes.push(code);
    } else {
      byNode.set(id, [code]);
    }
  };

  for (const finding of findings) {
    if (finding.contractRef !== null && finding.contractRef !== contractRef) continue;
    if (finding.code === 'CYCLE_DETECTED') {
      for (const id of finding.cycle) add(id, finding.code);
    } else {
      add(finding.providerId, finding.code);
    }
  }

  return byNode;
}
