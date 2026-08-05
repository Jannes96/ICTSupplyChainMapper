import { describe, expect, it } from 'vitest';
import { nodeId } from '../../domain/model/ids.ts';
import { formatProvider } from './de.ts';

const LONG = nodeId('TESTYGSJW5RI50LHSYVA');

/**
 * Only the formatting rule is tested, never the sentences. The wording has to
 * stay free to change — that is the point of keeping it out of the domain.
 */
describe('formatProvider', () => {
  it('puts the company name first and the code behind it', () => {
    expect(formatProvider(LONG, () => 'Weserwerk Analytics Ltd.')).toBe(
      'Weserwerk Analytics Ltd. (TESTYGSJW5…)',
    );
  });

  it('keeps enough of the code to recognise the row again', () => {
    // The code is what you search for in the register; a name alone would be
    // useless for that.
    expect(formatProvider(LONG, () => 'Irgendwer AG')).toContain(LONG.slice(0, 10));
  });

  it('leaves a short code whole', () => {
    expect(formatProvider(nodeId('P1'), () => 'Kurz GmbH')).toBe('Kurz GmbH (P1)');
  });

  it('falls back to the bare code when no name is known', () => {
    // Happens exactly where the master record is missing — the absence is the
    // finding, so the code has to stand on its own.
    expect(formatProvider(LONG, () => null)).toBe(LONG);
  });

  it('falls back when no resolver is supplied at all', () => {
    expect(formatProvider(LONG)).toBe(LONG);
  });
});
