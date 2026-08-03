import type { ContractRef, NodeId } from './ids.ts';

/**
 * Type of identification code used for an entity.
 * B_05.01 requires the code type to be reported alongside the code itself.
 */
export const CODE_TYPES = ['LEI', 'EUID', 'INTERNAL'] as const;
export type CodeType = (typeof CODE_TYPES)[number];

/**
 * "Type of person" of the ICT third-party service provider (B_05.01).
 */
export const PERSON_TYPES = ['LEGAL_PERSON', 'NATURAL_PERSON', 'OTHER'] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

/**
 * The reporting financial entity. It is not part of B_05.01 (which lists
 * providers only), but it is the root of every supply chain and therefore a
 * first-class node in the graph: rank 0 by definition.
 */
export interface FinancialEntity {
  readonly id: NodeId;
  readonly codeType: CodeType;
  readonly legalName: string;
  /** ISO 3166-1 alpha-2 country of the head office. */
  readonly country: string;
}

/**
 * One row of B_05.01 — master data of an ICT third-party service provider.
 */
export interface Provider {
  readonly id: NodeId;
  readonly codeType: CodeType;
  readonly legalName: string;
  /** ISO 3166-1 alpha-2 country of the head office. */
  readonly country: string;
  readonly personType: PersonType;
}

/**
 * One row of B_05.02 — the position of a provider inside one supply chain.
 *
 * The row carries the edge of the graph: `contractedBy` names the entity that
 * subcontracts to `providerId`. A row without `contractedBy` describes a direct
 * provider of the financial entity, so the edge starts at the root.
 *
 * `reportedRank` is what the register claims. It is deliberately *not* used to
 * build the graph — it is only compared against the rank derived from the edges.
 */
export interface SupplyChainLink {
  readonly contractRef: ContractRef;
  readonly providerId: NodeId;
  /** `null` means: contracted directly by the financial entity (rank 1). */
  readonly contractedBy: NodeId | null;
  /** `null` means: the register left the rank empty. */
  readonly reportedRank: number | null;
}

/**
 * A contractual arrangement. Contracts are not maintained as their own template
 * in this scope (that would be B_02.02); they are derived from the distinct
 * contract references occurring in B_05.02.
 */
export interface Contract {
  readonly ref: ContractRef;
  readonly linkCount: number;
}

/**
 * The complete input of the analysis: master data plus supply chain rows,
 * anchored at one financial entity.
 */
export interface Register {
  readonly financialEntity: FinancialEntity;
  readonly providers: readonly Provider[];
  readonly links: readonly SupplyChainLink[];
}

/** Distinct contract references in document order. */
export function contractsOf(register: Register): Contract[] {
  const counts = new Map<ContractRef, number>();
  for (const link of register.links) {
    counts.set(link.contractRef, (counts.get(link.contractRef) ?? 0) + 1);
  }
  return [...counts].map(([ref, linkCount]) => ({ ref, linkCount }));
}

/** Index of the providers by their identification code. */
export function providerIndex(register: Register): Map<NodeId, Provider> {
  return new Map(register.providers.map((provider) => [provider.id, provider]));
}
