import { describe, expect, it } from 'vitest';
import { buildChainWindowHash, parseChainWindowHash } from './ChainWindow.tsx';

describe('chain window route', () => {
  it('round-trips its parameters through the hash', () => {
    const params = { source: 'own', withFaults: false, contractRef: 'C-2026001' } as const;

    expect(parseChainWindowHash(buildChainWindowHash(params))).toEqual(params);
  });

  it('round-trips the large demo register', () => {
    const params = { source: 'demo-large', withFaults: true, contractRef: null } as const;

    expect(parseChainWindowHash(buildChainWindowHash(params))).toEqual(params);
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
    });

    expect(parseChainWindowHash(hash)?.contractRef).toBe('C 2026/001&x');
  });
});
