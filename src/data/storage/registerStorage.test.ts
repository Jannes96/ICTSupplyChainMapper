import { describe, expect, it } from 'vitest';
import type { EditorState } from '../../app/state/editorState.ts';
import { contractRef } from '../../domain/model/ids.ts';
import { link, provider, TEST_FINANCIAL_ENTITY } from '../../testing/registerBuilder.ts';
import type { KeyValueStorage } from './registerStorage.ts';
import {
  STORAGE_KEY,
  clearEditorState,
  loadEditorState,
  saveEditorState,
} from './registerStorage.ts';

/** In-memory stand-in for `window.localStorage`, so the tests need no DOM. */
function fakeStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  };
}

const state: EditorState = {
  financialEntity: TEST_FINANCIAL_ENTITY,
  providers: [provider('A'), provider('B')],
  links: [link('C1', 'A', null, 1), link('C1', 'B', 'A', null)],
  contractRefs: [contractRef('C1'), contractRef('C2')],
};

describe('registerStorage', () => {
  it('round-trips a register through storage', () => {
    const storage = fakeStorage();
    saveEditorState(storage, state);

    expect(loadEditorState(storage)).toEqual(state);
  });

  it('keeps an empty reported rank as null rather than dropping the row', () => {
    const storage = fakeStorage();
    saveEditorState(storage, state);

    expect(loadEditorState(storage)?.links[1]?.reportedRank).toBeNull();
  });

  it('returns nothing when there is no stored register', () => {
    expect(loadEditorState(fakeStorage())).toBeNull();
  });

  it('returns nothing for unreadable content instead of throwing', () => {
    expect(loadEditorState(fakeStorage({ [STORAGE_KEY]: 'kein JSON' }))).toBeNull();
  });

  it('refuses a payload written by another schema version', () => {
    const storage = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({ version: 99, state }),
    });

    expect(loadEditorState(storage)).toBeNull();
  });

  it('refuses a payload with a broken row rather than importing it half', () => {
    const storage = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({
        version: 1,
        state: { ...state, providers: [provider('A'), { legalName: 'ohne Kennung' }] },
      }),
    });

    expect(loadEditorState(storage)).toBeNull();
  });

  it('refuses a payload without a financial entity', () => {
    const storage = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({ version: 1, state: { ...state, financialEntity: null } }),
    });

    expect(loadEditorState(storage)).toBeNull();
  });

  it('clears the stored register', () => {
    const storage = fakeStorage();
    saveEditorState(storage, state);
    clearEditorState(storage);

    expect(loadEditorState(storage)).toBeNull();
  });
});
