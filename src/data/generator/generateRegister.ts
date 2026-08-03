import { contractRef, nodeId } from '../../domain/model/ids.ts';
import type { ContractRef, NodeId } from '../../domain/model/ids.ts';
import type { CodeType, FinancialEntity, PersonType, Provider, Register, SupplyChainLink } from '../../domain/model/register.ts';
import { SeededRandom } from './random.ts';

/**
 * Generator for synthetic registers.
 *
 * Everything here is invented. The identification codes carry a `TEST` prefix so
 * that no generated file can be mistaken for real LEIs, and the company names are
 * assembled from word lists. No real institution, provider or contract data ever
 * enters this repository.
 *
 * The chains are built level by level, which means the correct rank of every node
 * is known by construction — the generator never calls the ranking algorithm. So
 * a clean register is a genuinely independent expectation for the tests rather
 * than the algorithm confirming itself, and every fault below is injected on top
 * of a known-good baseline.
 */

export interface FaultOptions {
  /** Rows whose reported rank is changed to a wrong value. */
  readonly rankDeviations?: number;
  /** Back edges creating A → B → A. */
  readonly cycles?: number;
  /** Rows re-parented to a provider that nothing contracts. */
  readonly orphans?: number;
  /** References to identification codes without master data in B_05.01. */
  readonly danglingReferences?: number;
  /** Rows whose rank is left empty. */
  readonly missingRanks?: number;
}

export interface GeneratorOptions {
  readonly seed?: number;
  readonly contractCount?: number;
  /** Maximum rank, i.e. depth of subcontracting below the financial entity. */
  readonly maxDepth?: number;
  /** Maximum number of subcontractors one provider hands work to. */
  readonly maxBranching?: number;
  /** Size of the provider pool. A small pool makes providers recur across chains. */
  readonly providerPoolSize?: number;
  readonly faults?: FaultOptions;
}

const DEFAULTS = {
  seed: 42,
  contractCount: 3,
  maxDepth: 3,
  maxBranching: 3,
  providerPoolSize: 18,
} as const;

export const DEMO_FINANCIAL_ENTITY: FinancialEntity = {
  id: nodeId('TESTFE0000000000BANK'),
  codeType: 'LEI',
  legalName: 'Musterbank AG (synthetisch)',
  country: 'DE',
};

export function generateRegister(options: GeneratorOptions = {}): Register {
  const settings = { ...DEFAULTS, ...options };
  const random = new SeededRandom(settings.seed);

  const providers = generateProviders(random, settings.providerPoolSize);
  const links: SupplyChainLink[] = [];

  for (let index = 0; index < settings.contractCount; index++) {
    const ref = contractRef(`C-${String(2026000 + index * 37)}`);
    links.push(...generateChain(random, ref, providers, settings.maxDepth, settings.maxBranching));
  }

  const register: Register = { financialEntity: DEMO_FINANCIAL_ENTITY, providers, links };
  return settings.faults ? injectFaults(register, settings.faults, random) : register;
}

/** One chain: providers are drawn per level, so the rank equals the level. */
function generateChain(
  random: SeededRandom,
  ref: ContractRef,
  pool: readonly Provider[],
  maxDepth: number,
  maxBranching: number,
): SupplyChainLink[] {
  const links: SupplyChainLink[] = [];
  // Drawing without replacement inside one contract keeps the chain acyclic and
  // gives every provider exactly one rank per contract. Across contracts the pool
  // is drawn again, which is what produces providers appearing in several chains.
  const available = random.shuffle(pool);
  let cursor = 0;

  const take = (count: number): Provider[] => {
    const taken = available.slice(cursor, cursor + count);
    cursor += taken.length;
    return taken;
  };

  let currentLevel = take(random.int(1, Math.max(1, maxBranching - 1)));
  for (const provider of currentLevel) {
    links.push({ contractRef: ref, providerId: provider.id, contractedBy: null, reportedRank: 1 });
  }

  for (let rank = 2; rank <= maxDepth; rank++) {
    const nextLevel = take(random.int(1, maxBranching));
    if (nextLevel.length === 0) break;

    for (const provider of nextLevel) {
      // One or two parents from the level above: the graph is a DAG, not a tree,
      // and a provider with two mandates in the same chain is realistic.
      const parents = random.shuffle(currentLevel).slice(0, random.bool(0.25) ? 2 : 1);
      for (const parent of parents) {
        links.push({
          contractRef: ref,
          providerId: provider.id,
          contractedBy: parent.id,
          reportedRank: rank,
        });
      }
    }

    currentLevel = nextLevel;
  }

  return links;
}

function injectFaults(register: Register, faults: FaultOptions, random: SeededRandom): Register {
  const links = [...register.links];

  const pickIndex = (predicate: (link: SupplyChainLink) => boolean): number | null => {
    const candidates = links.map((link, index) => ({ link, index })).filter(({ link }) => predicate(link));
    if (candidates.length === 0) return null;
    return random.pick(candidates).index;
  };

  for (let n = 0; n < (faults.rankDeviations ?? 0); n++) {
    const index = pickIndex((link) => link.reportedRank !== null);
    if (index === null) break;
    const link = links[index] as SupplyChainLink;
    const wrongRank = (link.reportedRank ?? 1) + random.pick([-1, 1, 2]);
    links[index] = { ...link, reportedRank: Math.max(1, wrongRank) };
  }

  for (let n = 0; n < (faults.missingRanks ?? 0); n++) {
    const index = pickIndex((link) => link.reportedRank !== null);
    if (index === null) break;
    links[index] = { ...(links[index] as SupplyChainLink), reportedRank: null };
  }

  for (let n = 0; n < (faults.cycles ?? 0); n++) {
    // Turn a rank-1 provider into a subcontractor of one of its own descendants.
    const index = pickIndex((link) => link.reportedRank === 1);
    if (index === null) break;
    const link = links[index] as SupplyChainLink;
    const descendant = links.find(
      (candidate) => candidate.contractRef === link.contractRef && candidate.contractedBy === link.providerId,
    );
    if (!descendant) break;
    links[index] = { ...link, contractedBy: descendant.providerId };
  }

  for (let n = 0; n < (faults.orphans ?? 0); n++) {
    const index = pickIndex((link) => (link.reportedRank ?? 0) >= 2);
    if (index === null) break;
    const link = links[index] as SupplyChainLink;
    const used = new Set(
      links.filter((candidate) => candidate.contractRef === link.contractRef).map((candidate) => candidate.providerId),
    );
    const outsider = register.providers.find((provider) => !used.has(provider.id));
    if (!outsider) break;
    links[index] = { ...link, contractedBy: outsider.id };
  }

  for (let n = 0; n < (faults.danglingReferences ?? 0); n++) {
    const index = pickIndex((link) => link.contractedBy !== null);
    if (index === null) break;
    links[index] = { ...(links[index] as SupplyChainLink), contractedBy: nodeId(`TESTUNKNOWN${n}00000000`) };
  }

  return { ...register, links };
}

function generateProviders(random: SeededRandom, count: number): Provider[] {
  const providers: Provider[] = [];
  const usedNames = new Set<string>();

  while (providers.length < count) {
    const legalName = `${random.pick(NAME_PREFIXES)} ${random.pick(NAME_CORES)} ${random.pick(LEGAL_FORMS)}`;
    if (usedNames.has(legalName)) continue;
    usedNames.add(legalName);

    providers.push({
      id: syntheticCode(random),
      codeType: random.bool(0.85) ? 'LEI' : (random.pick(['EUID', 'INTERNAL']) as CodeType),
      legalName,
      country: random.pick(COUNTRIES),
      personType: (random.bool(0.95) ? 'LEGAL_PERSON' : 'OTHER') as PersonType,
    });
  }

  return providers;
}

/**
 * A 20-character, LEI-shaped but deliberately invalid code: the `TEST` prefix is
 * not issued by any LOU, so these can never collide with a real LEI.
 */
function syntheticCode(random: SeededRandom): NodeId {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'TEST';
  while (code.length < 20) code += alphabet[random.int(0, alphabet.length - 1)];
  return nodeId(code);
}

const NAME_PREFIXES = [
  'Nordlicht', 'Alpenblick', 'Hanse', 'Rheinstein', 'Baltic', 'Vertex', 'Meridian',
  'Kupfer', 'Silberbach', 'Atlas', 'Delta', 'Auriga', 'Weserwerk', 'Lumen',
] as const;

const NAME_CORES = [
  'Cloud', 'Payment', 'Data', 'Core Banking', 'Hosting', 'Security', 'Analytics',
  'Identity', 'Archive', 'Network', 'Compliance', 'Platform',
] as const;

const LEGAL_FORMS = ['GmbH', 'AG', 'SE', 'B.V.', 'S.A.', 'Ltd.', 'GmbH & Co. KG'] as const;

const COUNTRIES = ['DE', 'AT', 'NL', 'IE', 'LU', 'FR', 'PL', 'ES', 'US', 'GB'] as const;
