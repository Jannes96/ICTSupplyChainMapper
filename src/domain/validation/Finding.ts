import type { ContractRef, NodeId } from '../model/ids.ts';

/**
 * Findings are language-free by design: they carry a stable `code` plus the data
 * needed to describe the defect. The German wording lives in the presentation
 * layer (`src/presentation/i18n`). That keeps the domain testable without string
 * matching and leaves room for a second language or a CSV finding export.
 */
export type Severity = 'error' | 'warning' | 'info';

export const FINDING_CODES = [
  'UNKNOWN_PROVIDER_REFERENCE',
  'CYCLE_DETECTED',
  'ORPHAN_NODE',
  'RANK_DEVIATION',
  'RANK_NOT_COMPUTABLE',
  'MISSING_REPORTED_RANK',
  'UNUSED_PROVIDER',
  'DUPLICATE_PROVIDER',
] as const;

export type FindingCode = (typeof FINDING_CODES)[number];

interface FindingBase {
  readonly severity: Severity;
  /** `null` for findings about the master data (B_05.01), which is contract-agnostic. */
  readonly contractRef: ContractRef | null;
}

/** An identification code used in B_05.02 that has no master data row in B_05.01. */
export interface UnknownProviderReferenceFinding extends FindingBase {
  readonly code: 'UNKNOWN_PROVIDER_REFERENCE';
  readonly contractRef: ContractRef;
  readonly providerId: NodeId;
  /** Which column of B_05.02 the dangling reference came from. */
  readonly field: 'provider_id' | 'contracted_by';
}

/** A subcontracting chain that loops back on itself (A → B → A). */
export interface CycleDetectedFinding extends FindingBase {
  readonly code: 'CYCLE_DETECTED';
  readonly contractRef: ContractRef;
  readonly cycle: readonly NodeId[];
}

/** A provider in a chain that nobody contracts and that is not a direct provider. */
export interface OrphanNodeFinding extends FindingBase {
  readonly code: 'ORPHAN_NODE';
  readonly contractRef: ContractRef;
  readonly providerId: NodeId;
}

/** Reported rank and rank derived from the edges disagree. The core check. */
export interface RankDeviationFinding extends FindingBase {
  readonly code: 'RANK_DEVIATION';
  readonly contractRef: ContractRef;
  readonly providerId: NodeId;
  readonly reportedRank: number;
  readonly computedRank: number;
}

/** A rank is reported but no rank can be derived (cycle or missing path). */
export interface RankNotComputableFinding extends FindingBase {
  readonly code: 'RANK_NOT_COMPUTABLE';
  readonly contractRef: ContractRef;
  readonly providerId: NodeId;
  readonly reportedRank: number | null;
}

/** B_05.02 row without a rank; the computed rank can fill the gap. */
export interface MissingReportedRankFinding extends FindingBase {
  readonly code: 'MISSING_REPORTED_RANK';
  readonly contractRef: ContractRef;
  readonly providerId: NodeId;
  readonly computedRank: number | null;
}

/** Master data for a provider that appears in no chain at all. */
export interface UnusedProviderFinding extends FindingBase {
  readonly code: 'UNUSED_PROVIDER';
  readonly contractRef: null;
  readonly providerId: NodeId;
}

/** The same identification code carries master data more than once. */
export interface DuplicateProviderFinding extends FindingBase {
  readonly code: 'DUPLICATE_PROVIDER';
  readonly contractRef: null;
  readonly providerId: NodeId;
  readonly occurrences: number;
}

export type Finding =
  | UnknownProviderReferenceFinding
  | CycleDetectedFinding
  | OrphanNodeFinding
  | RankDeviationFinding
  | RankNotComputableFinding
  | MissingReportedRankFinding
  | UnusedProviderFinding
  | DuplicateProviderFinding;

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Most severe first; stable within a severity so output stays reproducible. */
export function bySeverity(a: Finding, b: Finding): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}
