/**
 * Branded identifier types.
 *
 * A plain `string` would let a contract reference be passed where a node id is
 * expected. Branding makes those mix-ups a compile error at zero runtime cost.
 */

declare const brand: unique symbol;

type Brand<TValue, TName extends string> = TValue & { readonly [brand]: TName };

/**
 * Identifier of a node in the supply chain graph.
 *
 * Financial entities and ICT third-party service providers share one id space:
 * both are identified by an identification code (LEI, EUID or an internal code),
 * and the same code must always resolve to the same node.
 */
export type NodeId = Brand<string, 'NodeId'>;

/** Reference number of a contractual arrangement (B_05.02, "contract_ref"). */
export type ContractRef = Brand<string, 'ContractRef'>;

export const nodeId = (value: string): NodeId => value as NodeId;

export const contractRef = (value: string): ContractRef => value as ContractRef;
