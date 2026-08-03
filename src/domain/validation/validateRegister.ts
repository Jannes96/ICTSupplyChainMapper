import type { AnalysisContext, ContractAnalysis } from '../analysis/ContractAnalysis.ts';
import { buildContext } from '../analysis/ContractAnalysis.ts';
import type { Register } from '../model/register.ts';
import type { Finding, Severity } from './Finding.ts';
import { bySeverity, countBySeverity } from './Finding.ts';
import { checkCycles } from './checks/checkCycles.ts';
import { checkMasterData } from './checks/checkMasterData.ts';
import { checkOrphans } from './checks/checkOrphans.ts';
import { checkRanks } from './checks/checkRanks.ts';
import { checkReferences } from './checks/checkReferences.ts';

export type Check = (context: AnalysisContext) => Finding[];

/**
 * The check registry. Adding a rule means adding a pure function here — no other
 * file changes. Order only affects presentation; findings are sorted by severity.
 */
export const CHECKS: readonly Check[] = [
  checkReferences,
  checkCycles,
  checkOrphans,
  checkRanks,
  checkMasterData,
];

export interface ValidationReport {
  readonly register: Register;
  /** Graph and computed ranks per contract — also the input for the visualisation. */
  readonly contracts: readonly ContractAnalysis[];
  readonly findings: readonly Finding[];
  readonly summary: Record<Severity, number>;
}

/**
 * Entry point of the core logic: register in, findings and computed ranks out.
 *
 * Deliberately free of UI, I/O and framework code — everything below `domain/`
 * runs in a plain Node process and is fully unit-testable.
 */
export function validateRegister(register: Register, checks: readonly Check[] = CHECKS): ValidationReport {
  const context = buildContext(register);
  const findings = checks.flatMap((check) => check(context)).sort(bySeverity);

  return {
    register,
    contracts: context.contracts,
    findings,
    summary: countBySeverity(findings),
  };
}
