import { analyzeContracts } from '../../domain/analysis/ContractAnalysis.ts';
import type { Rank } from '../../domain/graph/computeRanks.ts';
import type { ContractRef, NodeId } from '../../domain/model/ids.ts';
import type { FinancialEntity, Provider, Register, SupplyChainLink } from '../../domain/model/register.ts';

/**
 * State of the maintenance screen, plus the reducer that changes it.
 *
 * Kept as a plain reducer — no framework, no hooks, no storage — so every edit
 * rule below is a unit test rather than something you have to click through.
 *
 * It holds a little more than a `Register`: contract references live in their own
 * list. A `Register` derives its contracts from the rows of B_05.02, so a
 * contract without a single relationship would not exist there. While editing you
 * need exactly that state — you create the contract first and fill it afterwards.
 */
export interface EditorState {
  readonly financialEntity: FinancialEntity;
  readonly providers: readonly Provider[];
  readonly links: readonly SupplyChainLink[];
  readonly contractRefs: readonly ContractRef[];
}

export type EditorAction =
  | { type: 'financialEntity/set'; entity: FinancialEntity }
  /** Adds the provider, or replaces the existing one with the same code. */
  | { type: 'provider/upsert'; provider: Provider }
  | { type: 'provider/remove'; id: NodeId }
  | { type: 'contract/add'; ref: ContractRef }
  /** Changes a contract reference and carries all of its rows along. */
  | { type: 'contract/rename'; from: ContractRef; to: ContractRef }
  | { type: 'contract/remove'; ref: ContractRef }
  /** Adds the relationship, or updates the reported rank of an identical one. */
  | { type: 'link/upsert'; link: SupplyChainLink }
  /** Edits an existing relationship in place — including who contracts whom. */
  | { type: 'link/replace'; previous: SupplyChainLink; next: SupplyChainLink }
  | { type: 'link/remove'; link: SupplyChainLink }
  | { type: 'state/replace'; state: EditorState };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'financialEntity/set':
      return { ...state, financialEntity: action.entity };

    case 'provider/upsert': {
      const exists = state.providers.some((provider) => provider.id === action.provider.id);
      return {
        ...state,
        providers: exists
          ? state.providers.map((provider) =>
              provider.id === action.provider.id ? action.provider : provider,
            )
          : [...state.providers, action.provider],
      };
    }

    case 'provider/remove':
      return {
        ...state,
        providers: state.providers.filter((provider) => provider.id !== action.id),
        // Relationships go with the provider. Leaving them behind would turn a
        // deliberate deletion into a dangling reference — a defect the tool would
        // then report as if the register had been maintained badly.
        links: state.links.filter(
          (link) => link.providerId !== action.id && link.contractedBy !== action.id,
        ),
      };

    case 'contract/add':
      return state.contractRefs.includes(action.ref)
        ? state
        : { ...state, contractRefs: [...state.contractRefs, action.ref] };

    case 'contract/rename': {
      if (action.from === action.to) return state;
      // Renaming onto an existing reference would silently merge two chains into
      // one, and a merged chain computes different ranks. The caller has to
      // delete or rename the other contract first.
      if (state.contractRefs.includes(action.to)) return state;

      return {
        ...state,
        contractRefs: state.contractRefs.map((ref) => (ref === action.from ? action.to : ref)),
        links: state.links.map((link) =>
          link.contractRef === action.from ? { ...link, contractRef: action.to } : link,
        ),
      };
    }

    case 'contract/remove':
      return {
        ...state,
        contractRefs: state.contractRefs.filter((ref) => ref !== action.ref),
        links: state.links.filter((link) => link.contractRef !== action.ref),
      };

    case 'link/upsert': {
      const exists = state.links.some((link) => isSameRelationship(link, action.link));
      return {
        ...state,
        links: exists
          ? state.links.map((link) => (isSameRelationship(link, action.link) ? action.link : link))
          : [...state.links, action.link],
        contractRefs: state.contractRefs.includes(action.link.contractRef)
          ? state.contractRefs
          : [...state.contractRefs, action.link.contractRef],
      };
    }

    case 'link/replace': {
      // The edited row keeps its place in the list. If the new shape collides
      // with another existing row, that one gives way — otherwise editing would
      // be a way to produce the duplicate that `link/upsert` prevents.
      const withoutCollision = state.links.filter(
        (link) =>
          isSameRelationship(link, action.previous) || !isSameRelationship(link, action.next),
      );

      return {
        ...state,
        links: withoutCollision.map((link) =>
          isSameRelationship(link, action.previous) ? action.next : link,
        ),
        contractRefs: state.contractRefs.includes(action.next.contractRef)
          ? state.contractRefs
          : [...state.contractRefs, action.next.contractRef],
      };
    }

    case 'link/remove':
      return {
        ...state,
        links: state.links.filter((link) => !isSameRelationship(link, action.link)),
      };

    case 'state/replace':
      return action.state;
  }
}

/** Two rows describe the same relationship when contract, provider and client match. */
function isSameRelationship(a: SupplyChainLink, b: SupplyChainLink): boolean {
  return (
    a.contractRef === b.contractRef && a.providerId === b.providerId && a.contractedBy === b.contractedBy
  );
}

export function emptyEditorState(financialEntity: FinancialEntity): EditorState {
  return { financialEntity, providers: [], links: [], contractRefs: [] };
}

/** The register the core logic works on. Contracts without rows simply have none. */
export function toRegister(state: EditorState): Register {
  return {
    financialEntity: state.financialEntity,
    providers: state.providers,
    links: state.links,
  };
}

export function fromRegister(register: Register): EditorState {
  const contractRefs: ContractRef[] = [];
  for (const link of register.links) {
    if (!contractRefs.includes(link.contractRef)) contractRefs.push(link.contractRef);
  }
  return {
    financialEntity: register.financialEntity,
    providers: register.providers,
    links: register.links,
    contractRefs,
  };
}

/**
 * Rank a provider would get if this relationship were added.
 *
 * Powers the live display in the form: the user maintains the relationship and
 * sees the resulting rank before saving. It is computed on a prospective register
 * rather than by adding one to the client's rank — a provider may already be
 * reachable on a longer path, and the longest one decides.
 */
export function previewRank(
  state: EditorState,
  candidate: SupplyChainLink,
  /** The row being edited, so the preview does not count the old one as well. */
  replacing?: SupplyChainLink,
): Rank {
  const base = replacing
    ? state.links.filter((link) => !isSameRelationship(link, replacing))
    : state.links;
  const prospective: EditorState = { ...state, links: [...base, candidate] };
  const contract = analyzeContracts(toRegister(prospective)).find(
    (item) => item.ref === candidate.contractRef,
  );
  return contract?.ranks.get(candidate.providerId) ?? null;
}
