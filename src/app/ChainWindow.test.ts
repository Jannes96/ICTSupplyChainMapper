import { describe, expect, it } from 'vitest';
import { buildChainWindowHash, parseChainWindowHash } from './ChainWindow.tsx';

describe('chain window route', () => {
  it('round-trips its parameters through the hash', () => {
    const params = {
      source: 'own',
      withFaults: false,
      contractRef: 'C-2026001',
      view: 'layered',
    } as const;

    expect(parseChainWindowHash(buildChainWindowHash(params))).toEqual(params);
  });

  it('round-trips the large demo register', () => {
    const params = {
      source: 'demo-large',
      withFaults: true,
      contractRef: null,
      view: 'radial',
    } as const;

    expect(parseChainWindowHash(buildChainWindowHash(params))).toEqual(params);
  });

  it('keeps the layered view across a reload', () => {
    expect(parseChainWindowHash('#kette?quelle=demo&ansicht=ebenen')?.view).toBe('layered');
  });

  it('falls back to the radial view, which is what the window is opened for', () => {
    expect(parseChainWindowHash('#kette?quelle=demo')?.view).toBe('radial');
    expect(parseChainWindowHash('#kette?ansicht=quatsch')?.view).toBe('radial');
  });

  it('ignores a hash that belongs to the main view', () => {
    expect(parseChainWindowHash('')).toBeNull();
    expect(parseChainWindowHash('#etwas-anderes')).toBeNull();
  });

  it('falls back to the demo register for an unknown source', () => {
    expect(parseChainWindowHash('#kette?quelle=quatsch')).toMatchObject({ source: 'demo' });
  });

  it('keeps a contract reference containing a separator intact', () => {
    const hash = buildChainWindowHash({
      source: 'demo',
      withFaults: true,
      contractRef: 'C 2026/001&x',
      view: 'radial',
    });

    expect(parseChainWindowHash(hash)?.contractRef).toBe('C 2026/001&x');
  });
});
