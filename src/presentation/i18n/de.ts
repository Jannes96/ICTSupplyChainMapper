import type { CsvIssue } from '../../data/csv/registerCsv.ts';
import type { NodeId } from '../../domain/model/ids.ts';
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

/**
 * Looks up the legal name behind an identification code, or `null` when there is
 * none to be had.
 *
 * Findings carry the code and nothing else, and rightly so: the code is the key,
 * the name is master data that can change. Resolving one to the other is a matter
 * of presentation, which is why it happens here and not in the domain.
 */
export type NameResolver = (id: NodeId) => string | null;

/** Enough of a code to recognise it, without twenty characters in mid-sentence. */
function shortenCode(id: NodeId): string {
  return id.length > 12 ? `${id.slice(0, 10)}…` : id;
}

/**
 * A provider as the subject of a sentence: name first, code abbreviated behind
 * it. The code has to stay — in a register it is what you search for to find the
 * row again, and a finding naming only the company would be useless for that.
 *
 * Without a name the bare code stands alone. That is not a shortcoming: where the
 * name is missing because there is no master record, its absence *is* the
 * finding.
 */
export function formatProvider(id: NodeId, nameOf?: NameResolver): string {
  const name = nameOf?.(id) ?? null;
  return name === null ? id : `${name} (${shortenCode(id)})`;
}

/** Just the name, for chains where a code after every link would drown the text. */
function providerName(id: NodeId, nameOf?: NameResolver): string {
  return nameOf?.(id) ?? id;
}

export function describeFinding(finding: Finding, nameOf?: NameResolver): string {
  switch (finding.code) {
    case 'UNKNOWN_PROVIDER_REFERENCE': {
      const column = finding.field === 'provider_id' ? 'Dienstleister' : 'Auftraggeber';
      // No name can be resolved here by definition — that is what the finding says.
      return `Die in B_05.02 als ${column} verwendete Kennung ${finding.providerId} hat keinen Stammdatensatz in B_05.01.`;
    }
    case 'CYCLE_DETECTED': {
      const chain = [...finding.cycle, finding.cycle[0]]
        .map((id) => (id === undefined ? '' : providerName(id, nameOf)))
        .join(' → ');
      // Dash rather than a full stop after the chain: company names routinely end
      // in one themselves ("Baltic Hosting B.V."), and two in a row read as a typo.
      return `Die Kette schließt sich zu einem Kreis: ${chain} — eine Weiterverlagerung kann nicht auf sich selbst zurückführen; für die beteiligten Knoten ist kein Rang bestimmbar.`;
    }
    case 'ORPHAN_NODE':
      return `${formatProvider(finding.providerId, nameOf)} wird als Auftraggeber genannt, aber es ist nicht erfasst, von wem dieser Dienstleister selbst beauftragt wird. Die Kette ist an dieser Stelle unterbrochen.`;
    case 'RANK_DEVIATION':
      return `Gemeldeter Rang ${finding.reportedRank}, aus den Beziehungen berechneter Rang ${finding.computedRank}. Maßgeblich ist der längste Pfad vom Finanzunternehmen zu ${formatProvider(finding.providerId, nameOf)}.`;
    case 'RANK_NOT_COMPUTABLE':
      return `Für ${formatProvider(finding.providerId, nameOf)} lässt sich kein Rang berechnen — es existiert kein durchgängiger Pfad vom Finanzunternehmen (Zyklus oder fehlende Beauftragung).${
        finding.reportedRank === null ? '' : ` Gemeldet wurde Rang ${finding.reportedRank}.`
      }`;
    case 'MISSING_REPORTED_RANK':
      return `Für ${formatProvider(finding.providerId, nameOf)} ist kein Rang gemeldet. Berechnet wurde Rang ${finding.computedRank ?? '—'}.`;
    case 'UNUSED_PROVIDER':
      return `${formatProvider(finding.providerId, nameOf)} ist in B_05.01 erfasst, kommt aber in keiner Lieferkette vor.`;
    case 'DUPLICATE_PROVIDER':
      // Here the code itself is the subject — it is the thing handed out twice —
      // so it stays whole and in front.
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
