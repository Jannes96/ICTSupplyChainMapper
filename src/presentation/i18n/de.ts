import type { CsvIssue } from '../../data/csv/registerCsv.ts';
import type { CodeType, PersonType } from '../../domain/model/register.ts';
import type { Finding, Severity } from '../../domain/validation/Finding.ts';

/**
 * All German wording lives here.
 *
 * The domain emits codes, this module turns them into sentences for the user
 * interface. Tests therefore assert on codes, never on prose, and the texts can
 * be reworded without touching a single test.
 */

export const CODE_TYPE_LABELS: Record<CodeType, string> = {
  LEI: 'LEI',
  EUID: 'EUID',
  INTERNAL: 'Interne Kennung',
};

export const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  LEGAL_PERSON: 'Juristische Person',
  NATURAL_PERSON: 'Natürliche Person',
  OTHER: 'Sonstige',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  error: 'Fehler',
  warning: 'Hinweis',
  info: 'Information',
};

export const FINDING_TITLES: Record<Finding['code'], string> = {
  UNKNOWN_PROVIDER_REFERENCE: 'Kennung ohne Stammdatensatz',
  CYCLE_DETECTED: 'Zyklus in der Lieferkette',
  ORPHAN_NODE: 'Verwaister Knoten',
  RANK_DEVIATION: 'Rangabweichung',
  RANK_NOT_COMPUTABLE: 'Rang nicht bestimmbar',
  MISSING_REPORTED_RANK: 'Rang nicht gemeldet',
  UNUSED_PROVIDER: 'Dienstleister ohne Lieferkette',
  DUPLICATE_PROVIDER: 'Kennung mehrfach vergeben',
};

export function describeFinding(finding: Finding): string {
  switch (finding.code) {
    case 'UNKNOWN_PROVIDER_REFERENCE': {
      const column = finding.field === 'provider_id' ? 'Dienstleister' : 'Auftraggeber';
      return `Die in B_05.02 als ${column} verwendete Kennung ${finding.providerId} hat keinen Stammdatensatz in B_05.01.`;
    }
    case 'CYCLE_DETECTED': {
      const chain = [...finding.cycle, finding.cycle[0]].join(' → ');
      return `Die Kette schließt sich zu einem Kreis: ${chain}. Eine Weiterverlagerung kann nicht auf sich selbst zurückführen; für die beteiligten Knoten ist kein Rang bestimmbar.`;
    }
    case 'ORPHAN_NODE':
      return `${finding.providerId} wird als Auftraggeber genannt, aber es ist nicht erfasst, von wem dieser Dienstleister selbst beauftragt wird. Die Kette ist an dieser Stelle unterbrochen.`;
    case 'RANK_DEVIATION':
      return `Gemeldeter Rang ${finding.reportedRank}, aus den Beziehungen berechneter Rang ${finding.computedRank}. Maßgeblich ist der längste Pfad vom Finanzunternehmen zu ${finding.providerId}.`;
    case 'RANK_NOT_COMPUTABLE':
      return `Für ${finding.providerId} lässt sich kein Rang berechnen — es existiert kein durchgängiger Pfad vom Finanzunternehmen (Zyklus oder fehlende Beauftragung).${
        finding.reportedRank === null ? '' : ` Gemeldet wurde Rang ${finding.reportedRank}.`
      }`;
    case 'MISSING_REPORTED_RANK':
      return `Für ${finding.providerId} ist kein Rang gemeldet. Berechnet wurde Rang ${finding.computedRank ?? '—'}.`;
    case 'UNUSED_PROVIDER':
      return `${finding.providerId} ist in B_05.01 erfasst, kommt aber in keiner Lieferkette vor.`;
    case 'DUPLICATE_PROVIDER':
      return `Die Kennung ${finding.providerId} ist in B_05.01 ${finding.occurrences}-mal vergeben. Eine Kennung muss genau einen Dienstleister bezeichnen.`;
  }
}

export function describeCsvIssue(issue: CsvIssue): string {
  const location = `${issue.template}, Zeile ${issue.line}, Spalte „${issue.column}“`;
  switch (issue.code) {
    case 'MISSING_COLUMN':
      return `${location}: Pflichtspalte fehlt in der Datei.`;
    case 'MISSING_VALUE':
      return `${location}: Pflichtangabe fehlt.`;
    case 'INVALID_VALUE':
      return `${location}: unzulässiger Wert „${issue.value ?? ''}“.`;
  }
}

export function formatRank(rank: number | null): string {
  return rank === null ? 'nicht bestimmbar' : String(rank);
}
