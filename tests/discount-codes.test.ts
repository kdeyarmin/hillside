import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CODE_ALPHABET,
  GIFT_CARD_CODE_LENGTH,
  formatGiftCardCode,
  generateGiftCardCode,
  generatePromoCode,
  generateUniqueCodes,
  isValidPromoCode,
  maskGiftCardCode,
  normalizeGiftCardCode,
  normalizePromoCode,
  randomCodeChars
} from '../lib/discount-codes.ts';

/** Walks the alphabet in order, so a generated code is predictable to assert on. */
function sequentialIndex() {
  let next = 0;
  return () => next++ % CODE_ALPHABET.length;
}

describe('the code alphabet', () => {
  it('leaves out every character a printed card could be misread as another', () => {
    for (const confusable of ['I', 'L', 'O', 'U']) {
      assert.equal(CODE_ALPHABET.includes(confusable), false);
    }
    assert.equal(CODE_ALPHABET.length, 32);
  });
});

describe('generateGiftCardCode', () => {
  it('prints as four groups of four from the alphabet', () => {
    const code = generateGiftCardCode(sequentialIndex());
    assert.equal(code, '0123-4567-89AB-CDEF');
    assert.equal(code.replace(/-/g, '').length, GIFT_CARD_CODE_LENGTH);
  });

  it('draws every character from the alphabet, run after run', () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      for (const character of generateGiftCardCode().replace(/-/g, '')) {
        assert.equal(CODE_ALPHABET.includes(character), true);
      }
    }
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateGiftCardCode()));
    assert.equal(codes.size, 200);
  });
});

describe('normalizeGiftCardCode', () => {
  const stored = '0123-4567-89AB-CDEF';

  it('accepts the card however it was typed back in', () => {
    assert.equal(normalizeGiftCardCode('0123-4567-89AB-CDEF'), stored);
    assert.equal(normalizeGiftCardCode('0123456789abcdef'), stored);
    assert.equal(normalizeGiftCardCode(' 0123 4567 89ab cdef '), stored);
    assert.equal(normalizeGiftCardCode('0123.4567.89ab.cdef'), stored);
  });

  it('folds the characters the alphabet deliberately left out', () => {
    // A card read off paper: the reader saw letters where the digits are.
    assert.equal(normalizeGiftCardCode('O123-4567-89AB-CDEF'), stored);
    assert.equal(normalizeGiftCardCode('0i23-4567-89AB-CDEF'), '0123-4567-89AB-CDEF');
    assert.equal(normalizeGiftCardCode('0L23-4567-89AB-CDEF'), '0123-4567-89AB-CDEF');
  });

  it('refuses anything that is not a code this shop could have issued', () => {
    assert.equal(normalizeGiftCardCode(''), null);
    assert.equal(normalizeGiftCardCode('0123-4567-89AB'), null);
    assert.equal(normalizeGiftCardCode('0123-4567-89AB-CDEF-0000'), null);
    assert.equal(normalizeGiftCardCode(null), null);
    assert.equal(normalizeGiftCardCode(12345), null);
  });
});

describe('maskGiftCardCode', () => {
  it('keeps only the last group, which is what a card is identified by', () => {
    assert.equal(maskGiftCardCode('0123-4567-89AB-CDEF'), '••••-••••-••••-CDEF');
  });

  it('groups an unformatted code before masking it', () => {
    assert.equal(maskGiftCardCode('0123456789ABCDEF'), '••••-••••-••••-CDEF');
  });
});

describe('formatGiftCardCode', () => {
  it('groups whatever it is given, in fours', () => {
    assert.equal(formatGiftCardCode('0123456789abcdef'), '0123-4567-89AB-CDEF');
    assert.equal(formatGiftCardCode('abc'), 'ABC');
  });
});

describe('normalizePromoCode', () => {
  it('is case-insensitive and drops what a code cannot contain', () => {
    assert.equal(normalizePromoCode('spring20'), 'SPRING20');
    assert.equal(normalizePromoCode(' spring 20 '), 'SPRING20');
    assert.equal(normalizePromoCode('spring$20!'), 'SPRING20');
  });

  it('keeps the hyphens and underscores the owner typed deliberately', () => {
    assert.equal(normalizePromoCode('market-2026'), 'MARKET-2026');
    assert.equal(normalizePromoCode('open_house'), 'OPEN_HOUSE');
  });

  it('answers with an empty string for anything unusable', () => {
    assert.equal(normalizePromoCode(''), '');
    assert.equal(normalizePromoCode('!!!'), '');
    assert.equal(normalizePromoCode(null), '');
  });
});

describe('isValidPromoCode', () => {
  it('wants at least three characters, one of them a letter or a digit', () => {
    assert.equal(isValidPromoCode('SPRING20'), true);
    assert.equal(isValidPromoCode('HI'), false);
    assert.equal(isValidPromoCode('---'), false);
    assert.equal(isValidPromoCode(''), false);
  });
});

describe('generatePromoCode', () => {
  it('puts the prefix in front of a random tail', () => {
    assert.equal(generatePromoCode('MARKET', sequentialIndex()), 'MARKET-012345');
  });

  it('normalizes a prefix that was typed as words', () => {
    assert.equal(generatePromoCode('Spring Fair', sequentialIndex()), 'SPRINGFAIR-012345');
  });

  it('makes a bare code when there is no prefix', () => {
    assert.equal(generatePromoCode('', sequentialIndex()), '012345');
  });
});

describe('generateUniqueCodes', () => {
  it('gives back as many distinct codes as were asked for', () => {
    const codes = generateUniqueCodes(50, () => generateGiftCardCode());
    assert.equal(codes.length, 50);
    assert.equal(new Set(codes).size, 50);
  });

  it('stops rather than spinning when the maker cannot produce enough', () => {
    let calls = 0;
    const codes = generateUniqueCodes(5, () => {
      calls += 1;
      return 'THE-SAME-CODE';
    });
    assert.deepEqual(codes, ['THE-SAME-CODE']);
    // Bounded by attemptsPerCode, not looping forever on a maker that repeats.
    assert.equal(calls, 60);
  });
});

describe('randomCodeChars', () => {
  it('asks the source for exactly as many characters as the length', () => {
    const seen: number[] = [];
    randomCodeChars(4, (max) => {
      seen.push(max);
      return 0;
    });
    assert.deepEqual(seen, [32, 32, 32, 32]);
  });
});
