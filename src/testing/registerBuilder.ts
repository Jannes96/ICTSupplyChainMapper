import { contractRef, nodeId } from '../domain/model/ids.ts';
import type { FinancialEntity, Provider, Register, SupplyChainLink } from '../domain/model/register.ts';

/**
 * Test helpers. Registers in tests are written as short readable literals so the
 * shape of the chain stays visible in the test itself.
 */

export const TEST_FINANCIAL_ENTITY: FinancialEntity = {
  id: nodeId('FE'),
  codeType: 'LEI',
  legalName: 'Testbank AG',
  country: 'DE',
};

export function provider(id: string, overrides: Partial<Provider> = {}): Provider {
  return {
    id: nodeId(id),
    codeType: 'LEI',
    legalName: `Provider ${id}`,
    country: 'DE',
    personType: 'LEGAL_PERSON',
    ...overrides,
  };
}

/** `link('C1', 'B', 'A', 2)` — in contract C1, A subcontracts to B, reported rank 2. */
export function link(
  contract: string,
  providerId: string,
  contractedBy: string | null,
  reportedRank: number | null,
): SupplyChainLink {
  return {
    contractRef: contractRef(contract),
    providerId: nodeId(providerId),
    contractedBy: contractedBy === null ? null : nodeId(contractedBy),
    reportedRank,
  };
}

/**
 * Builds a register from links. Master data is derived from the ids used, unless
 * `providerIds` is given explicitly — that is how a missing B_05.01 row is set up.
 */
export function makeRegister(links: SupplyChainLink[], providerIds?: string[]): Register {
  const derived = new Set<string>();
  for (const item of links) {
    derived.add(item.providerId);
    if (item.contractedBy !== null) derived.add(item.contractedBy);
  }

  const ids = providerIds ?? [...derived];

  return {
    financialEntity: TEST_FINANCIAL_ENTITY,
    providers: ids.map((id) => provider(id)),
    links,
  };
}
