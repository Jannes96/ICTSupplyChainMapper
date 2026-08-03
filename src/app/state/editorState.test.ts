import { describe, expect, it } from 'vitest';
import { contractRef, nodeId } from '../../domain/model/ids.ts';
import { link, provider, TEST_FINANCIAL_ENTITY } from '../../testing/registerBuilder.ts';
import type { EditorState } from './editorState.ts';
import { editorReducer, emptyEditorState, fromRegister, previewRank, toRegister } from './editorState.ts';

const n = nodeId;
const c = contractRef;

const base: EditorState = {
  financialEntity: TEST_FINANCIAL_ENTITY,
  providers: [provider('A'), provider('B')],
  links: [link('C1', 'A', null, 1), link('C1', 'B', 'A', 2)],
  contractRefs: [c('C1')],
};

describe('editorReducer', () => {
  describe('providers', () => {
    it('adds a new provider', () => {
      const next = editorReducer(base, { type: 'provider/upsert', provider: provider('C') });

      expect(next.providers.map((item) => item.id)).toEqual([n('A'), n('B'), n('C')]);
    });

    it('replaces an existing provider instead of duplicating the code', () => {
      const renamed = provider('B', { legalName: 'Neuer Name AG' });
      const next = editorReducer(base, { type: 'provider/upsert', provider: renamed });

      expect(next.providers).toHaveLength(2);
      expect(next.providers[1]?.legalName).toBe('Neuer Name AG');
    });

    it('removes the relationships along with the provider', () => {
      const next = editorReducer(base, { type: 'provider/remove', id: n('A') });

      expect(next.providers.map((item) => item.id)).toEqual([n('B')]);
      // Both rows referenced A — one as provider, one as client.
      expect(next.links).toEqual([]);
    });

    it('keeps relationships that do not touch the removed provider', () => {
      const next = editorReducer(base, { type: 'provider/remove', id: n('B') });

      expect(next.links).toEqual([link('C1', 'A', null, 1)]);
    });
  });

  describe('contracts', () => {
    it('creates an empty contract, which a register alone could not represent', () => {
      const next = editorReducer(base, { type: 'contract/add', ref: c('C2') });

      expect(next.contractRefs).toEqual([c('C1'), c('C2')]);
      expect(toRegister(next).links).toHaveLength(2);
    });

    it('ignores a contract reference that already exists', () => {
      expect(editorReducer(base, { type: 'contract/add', ref: c('C1') })).toBe(base);
    });

    it('removes the contract with all of its relationships', () => {
      const next = editorReducer(base, { type: 'contract/remove', ref: c('C1') });

      expect(next.contractRefs).toEqual([]);
      expect(next.links).toEqual([]);
      expect(next.providers).toHaveLength(2);
    });
  });

  describe('relationships', () => {
    it('adds a relationship and registers its contract on the way', () => {
      const next = editorReducer(base, { type: 'link/upsert', link: link('C2', 'B', null, 1) });

      expect(next.links).toHaveLength(3);
      expect(next.contractRefs).toEqual([c('C1'), c('C2')]);
    });

    it('updates the reported rank of an identical relationship instead of adding a second row', () => {
      const next = editorReducer(base, { type: 'link/upsert', link: link('C1', 'B', 'A', 7) });

      expect(next.links).toHaveLength(2);
      expect(next.links[1]?.reportedRank).toBe(7);
    });

    it('treats the same provider under a different client as a separate relationship', () => {
      const next = editorReducer(base, { type: 'link/upsert', link: link('C1', 'B', null, 1) });

      expect(next.links).toHaveLength(3);
    });

    it('removes a relationship', () => {
      const next = editorReducer(base, { type: 'link/remove', link: link('C1', 'B', 'A', 2) });

      expect(next.links).toEqual([link('C1', 'A', null, 1)]);
    });
  });

  it('round-trips through a register', () => {
    expect(fromRegister(toRegister(base))).toEqual(base);
  });

  it('starts empty', () => {
    const empty = emptyEditorState(TEST_FINANCIAL_ENTITY);

    expect(toRegister(empty)).toEqual({
      financialEntity: TEST_FINANCIAL_ENTITY,
      providers: [],
      links: [],
    });
  });
});

describe('previewRank', () => {
  it('reports rank 1 for a provider contracted directly', () => {
    expect(previewRank(base, link('C1', 'C', null, null))).toBe(1);
  });

  it('reports the rank below the selected client', () => {
    expect(previewRank(base, link('C1', 'C', 'B', null))).toBe(3);
  });

  it('takes the longest path when the provider is already in the chain', () => {
    // C is already a direct provider (rank 1). Contracting it through B as well
    // makes it rank 3 — the deeper position wins, and the preview has to say the
    // same thing the check will.
    const withDirectC = editorReducer(base, { type: 'link/upsert', link: link('C1', 'C', null, 1) });

    expect(previewRank(withDirectC, link('C1', 'C', 'B', null))).toBe(3);
  });

  it('reports no rank when the relationship would close a cycle', () => {
    // A already contracts B, so letting B contract A closes A → B → A.
    expect(previewRank(base, link('C1', 'A', 'B', null))).toBeNull();
  });

  it('leaves the state untouched', () => {
    const before = structuredClone(base);
    previewRank(base, link('C1', 'C', 'B', null));

    expect(base).toEqual(before);
  });
});
