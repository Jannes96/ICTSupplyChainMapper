import { contractRef, nodeId } from '../../domain/model/ids.ts';
import type { FinancialEntity, Provider, Register, SupplyChainLink } from '../../domain/model/register.ts';
import { CODE_TYPES, PERSON_TYPES } from '../../domain/model/register.ts';
import type { Delimiter } from './csv.ts';
import { parseCsv, serializeCsv, toRecords } from './csv.ts';

/**
 * Mapping between the CSV files and the domain model.
 *
 * The column names are readable English rather than the ITS column codes
 * (b_05.01.0010 …); the mapping to the official codes is documented in the README
 * and can be added as an alias table in this file without touching the domain.
 */
export const TEMPLATES = {
  providers: 'B_05.01',
  supplyChain: 'B_05.02',
} as const;

export type TemplateId = (typeof TEMPLATES)[keyof typeof TEMPLATES];

export const PROVIDER_COLUMNS = ['provider_id', 'code_type', 'legal_name', 'country', 'person_type'] as const;
export const SUPPLY_CHAIN_COLUMNS = ['contract_ref', 'provider_id', 'reported_rank', 'contracted_by'] as const;

/**
 * Import problems are technical, not regulatory: a malformed file is not a
 * finding about the register. They are reported separately so the finding list
 * stays exactly the list of content defects.
 */
export type CsvIssueCode = 'MISSING_COLUMN' | 'MISSING_VALUE' | 'INVALID_VALUE';

export interface CsvIssue {
  readonly template: TemplateId;
  /** 1-based line in the file, header included. `1` refers to the header itself. */
  readonly line: number;
  readonly column: string;
  readonly code: CsvIssueCode;
  readonly value?: string;
}

export interface ParseResult<T> {
  readonly rows: T[];
  readonly issues: CsvIssue[];
}

export function parseProvidersCsv(text: string, delimiter?: Delimiter): ParseResult<Provider> {
  const records = toRecords(parseCsv(text, delimiter));
  const issues: CsvIssue[] = [];
  const template = TEMPLATES.providers;

  const missing = missingColumns(text, PROVIDER_COLUMNS, delimiter);
  if (missing.length > 0) {
    return { rows: [], issues: missing.map((column) => ({ template, line: 1, column, code: 'MISSING_COLUMN' })) };
  }

  const rows: Provider[] = [];

  records.forEach((record, index) => {
    const line = index + 2;
    const id = (record['provider_id'] ?? '').trim();
    const legalName = (record['legal_name'] ?? '').trim();

    if (id === '') {
      issues.push({ template, line, column: 'provider_id', code: 'MISSING_VALUE' });
      return;
    }
    if (legalName === '') {
      issues.push({ template, line, column: 'legal_name', code: 'MISSING_VALUE' });
    }

    const codeType = parseEnum(record['code_type'], CODE_TYPES);
    if (codeType === null) {
      issues.push({ template, line, column: 'code_type', code: 'INVALID_VALUE', value: record['code_type'] ?? '' });
    }

    const personType = parseEnum(record['person_type'], PERSON_TYPES);
    if (personType === null) {
      issues.push({ template, line, column: 'person_type', code: 'INVALID_VALUE', value: record['person_type'] ?? '' });
    }

    const country = (record['country'] ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      issues.push({ template, line, column: 'country', code: 'INVALID_VALUE', value: record['country'] ?? '' });
    }

    rows.push({
      id: nodeId(id),
      codeType: codeType ?? 'INTERNAL',
      legalName,
      country,
      personType: personType ?? 'OTHER',
    });
  });

  return { rows, issues };
}

export function parseSupplyChainCsv(text: string, delimiter?: Delimiter): ParseResult<SupplyChainLink> {
  const records = toRecords(parseCsv(text, delimiter));
  const issues: CsvIssue[] = [];
  const template = TEMPLATES.supplyChain;

  const missing = missingColumns(text, SUPPLY_CHAIN_COLUMNS, delimiter);
  if (missing.length > 0) {
    return { rows: [], issues: missing.map((column) => ({ template, line: 1, column, code: 'MISSING_COLUMN' })) };
  }

  const rows: SupplyChainLink[] = [];

  records.forEach((record, index) => {
    const line = index + 2;
    const ref = (record['contract_ref'] ?? '').trim();
    const provider = (record['provider_id'] ?? '').trim();

    if (ref === '') {
      issues.push({ template, line, column: 'contract_ref', code: 'MISSING_VALUE' });
      return;
    }
    if (provider === '') {
      issues.push({ template, line, column: 'provider_id', code: 'MISSING_VALUE' });
      return;
    }

    const rawRank = (record['reported_rank'] ?? '').trim();
    let reportedRank: number | null = null;
    if (rawRank !== '') {
      const parsed = Number(rawRank);
      if (!Number.isInteger(parsed) || parsed < 1) {
        issues.push({ template, line, column: 'reported_rank', code: 'INVALID_VALUE', value: rawRank });
      } else {
        reportedRank = parsed;
      }
    }

    const contractedBy = (record['contracted_by'] ?? '').trim();

    rows.push({
      contractRef: contractRef(ref),
      providerId: nodeId(provider),
      contractedBy: contractedBy === '' ? null : nodeId(contractedBy),
      reportedRank,
    });
  });

  return { rows, issues };
}

export interface RegisterCsvInput {
  readonly financialEntity: FinancialEntity;
  readonly providersCsv: string;
  readonly supplyChainCsv: string;
  readonly delimiter?: Delimiter;
}

/**
 * Reads both templates into one register.
 *
 * The financial entity is passed in rather than read from a file: it is the
 * reporting institution itself and has no row in either template. Keeping it out
 * of the CSVs is what makes the import exactly B_05.01 + B_05.02.
 */
export function importRegister(input: RegisterCsvInput): { register: Register; issues: CsvIssue[] } {
  const providers = parseProvidersCsv(input.providersCsv, input.delimiter);
  const links = parseSupplyChainCsv(input.supplyChainCsv, input.delimiter);

  return {
    register: {
      financialEntity: input.financialEntity,
      providers: providers.rows,
      links: links.rows,
    },
    issues: [...providers.issues, ...links.issues],
  };
}

export function exportProvidersCsv(providers: readonly Provider[], delimiter: Delimiter = ','): string {
  const rows: string[][] = [
    [...PROVIDER_COLUMNS],
    ...providers.map((provider) => [
      provider.id,
      provider.codeType,
      provider.legalName,
      provider.country,
      provider.personType,
    ]),
  ];
  return serializeCsv(rows, delimiter);
}

export function exportSupplyChainCsv(links: readonly SupplyChainLink[], delimiter: Delimiter = ','): string {
  const rows: string[][] = [
    [...SUPPLY_CHAIN_COLUMNS],
    ...links.map((link) => [
      link.contractRef,
      link.providerId,
      link.reportedRank === null ? '' : String(link.reportedRank),
      link.contractedBy ?? '',
    ]),
  ];
  return serializeCsv(rows, delimiter);
}

function missingColumns(text: string, required: readonly string[], delimiter?: Delimiter): string[] {
  const header = parseCsv(text, delimiter)[0] ?? [];
  const present = new Set(header.map((name) => name.trim().toLowerCase()));
  return required.filter((column) => !present.has(column));
}

function parseEnum<T extends string>(raw: string | undefined, allowed: readonly T[]): T | null {
  const normalised = (raw ?? '').trim().toUpperCase().replaceAll(' ', '_');
  return allowed.find((value) => value === normalised) ?? null;
}
