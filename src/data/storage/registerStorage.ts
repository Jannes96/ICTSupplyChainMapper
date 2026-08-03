import type { EditorState } from '../../app/state/editorState.ts';
import { contractRef, nodeId } from '../../domain/model/ids.ts';
import type { CodeType, PersonType } from '../../domain/model/register.ts';
import { CODE_TYPES, PERSON_TYPES } from '../../domain/model/register.ts';

/**
 * Persistence in the browser.
 *
 * There is no backend, so `localStorage` is the only place a register can
 * survive a reload — and it is the right place anyway: the data never leaves the
 * machine it was typed on, which matters for a tool that will otherwise be
 * pointed at outsourcing data.
 *
 * The stored payload carries a schema version. Anything unreadable, of the wrong
 * version or of the wrong shape is treated as absent rather than repaired: a
 * half-understood register would produce findings that say more about the parser
 * than about the data.
 */

export const STORAGE_KEY = 'ict-supply-chain-mapper.register';
export const SCHEMA_VERSION = 1;

/** The slice of the Web Storage API used here — small enough to fake in a test. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function saveEditorState(storage: KeyValueStorage, state: EditorState): void {
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, state }));
}

export function clearEditorState(storage: KeyValueStorage): void {
  storage.removeItem(STORAGE_KEY);
}

export function loadEditorState(storage: KeyValueStorage): EditorState | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || parsed['version'] !== SCHEMA_VERSION) return null;
  return parseEditorState(parsed['state']);
}

function parseEditorState(value: unknown): EditorState | null {
  if (!isRecord(value)) return null;

  const financialEntity = parseFinancialEntity(value['financialEntity']);
  if (!financialEntity) return null;

  const providers = parseArray(value['providers'], parseProvider);
  const links = parseArray(value['links'], parseLink);
  const contractRefs = parseArray(value['contractRefs'], (entry) =>
    typeof entry === 'string' && entry !== '' ? contractRef(entry) : null,
  );
  if (!providers || !links || !contractRefs) return null;

  return { financialEntity, providers, links, contractRefs };
}

function parseFinancialEntity(value: unknown): EditorState['financialEntity'] | null {
  if (!isRecord(value)) return null;
  const id = text(value['id']);
  const legalName = text(value['legalName']);
  if (id === null || legalName === null) return null;

  return {
    id: nodeId(id),
    codeType: parseEnum(value['codeType'], CODE_TYPES) ?? 'LEI',
    legalName,
    country: text(value['country']) ?? '',
  };
}

function parseProvider(value: unknown): EditorState['providers'][number] | null {
  if (!isRecord(value)) return null;
  const id = text(value['id']);
  if (id === null) return null;

  return {
    id: nodeId(id),
    codeType: parseEnum<CodeType>(value['codeType'], CODE_TYPES) ?? 'INTERNAL',
    legalName: text(value['legalName']) ?? '',
    country: text(value['country']) ?? '',
    personType: parseEnum<PersonType>(value['personType'], PERSON_TYPES) ?? 'OTHER',
  };
}

function parseLink(value: unknown): EditorState['links'][number] | null {
  if (!isRecord(value)) return null;
  const ref = text(value['contractRef']);
  const providerId = text(value['providerId']);
  if (ref === null || providerId === null) return null;

  const contractedBy = text(value['contractedBy']);
  const reportedRank = value['reportedRank'];

  return {
    contractRef: contractRef(ref),
    providerId: nodeId(providerId),
    contractedBy: contractedBy === null ? null : nodeId(contractedBy),
    reportedRank: typeof reportedRank === 'number' && Number.isInteger(reportedRank) ? reportedRank : null,
  };
}

function parseArray<T>(value: unknown, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const result: T[] = [];
  for (const entry of value) {
    const parsed = parse(entry);
    // One broken row invalidates the whole payload — a silently shortened
    // register is worse than starting over.
    if (parsed === null) return null;
    result.push(parsed);
  }
  return result;
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' ? (allowed.find((entry) => entry === value) ?? null) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
