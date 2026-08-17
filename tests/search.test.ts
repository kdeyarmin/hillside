import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterSearchHits,
  matchesAnySearchField,
  matchesSearchTerm,
  tokenizeSearch
} from '../lib/search.ts';

describe('tokenizeSearch', () => {
  it('drops punctuation and one-letter noise, but keeps a lone letter', () => {
    assert.deepEqual(tokenizeSearch('  Yellow leaves! '), ['yellow', 'leaves']);
    assert.deepEqual(tokenizeSearch('zz'), ['zz']);
    assert.deepEqual(tokenizeSearch('z'), ['z']);
    assert.deepEqual(tokenizeSearch('!!!'), []);
    assert.deepEqual(tokenizeSearch(''), []);
  });
});

describe('matchesSearchTerm', () => {
  /**
   * The live regression: searching "tea" returned the Monstera Deliciosa care
   * guide because its summary said "steady watering".
   */
  it('does not treat tea as a match for steady', () => {
    assert.equal(matchesSearchTerm('Bright light and steady watering.', 'tea'), false);
    assert.equal(matchesSearchTerm('A monstera that prefers consistent moisture.', 'tea'), false);
  });

  it('still matches teas, teapot and hyphenated tea goods', () => {
    assert.equal(matchesSearchTerm('Loose-leaf tea blend', 'tea'), true);
    assert.equal(matchesSearchTerm('Hillside teas', 'tea'), true);
    assert.equal(matchesSearchTerm('Ceramic teapot', 'tea'), true);
    assert.equal(matchesSearchTerm('tea-cup saucer', 'tea'), true);
  });

  it('requires every token, as a start-of-word', () => {
    assert.equal(matchesSearchTerm('Yellowing leaves on a fiddle-leaf fig', 'yellow leaves'), true);
    assert.equal(
      matchesSearchTerm('Yellowing leaves on a fiddle-leaf fig', 'yellow mosaic'),
      false
    );
    assert.equal(matchesSearchTerm('Watering notes for succulents', 'water'), true);
    assert.equal(matchesSearchTerm('Instead of misting, soak the soil.', 'tea'), false);
  });

  it('finds a ZZ plant from a single letter', () => {
    assert.equal(matchesSearchTerm('ZZ plant', 'z'), true);
  });
});

describe('matchesAnySearchField and filterSearchHits', () => {
  it('searches across fields as one haystack', () => {
    assert.equal(
      matchesAnySearchField(
        ['Monstera Deliciosa', 'A climbing aroid.', 'Keep watering steady.'],
        'tea'
      ),
      false
    );
    assert.equal(
      matchesAnySearchField(['Chamomile tea', 'Evening cup', 'Caffeine-free blend'], 'tea'),
      true
    );
  });

  it('keeps only word-aware hits, in input order, up to the limit', () => {
    const items = [
      { name: 'Monstera', summary: 'steady watering' },
      { name: 'Garden tea tin', summary: 'loose leaf' },
      { name: 'Instead pot', summary: 'ceramic' },
      { name: 'Teapot brush', summary: 'cleaning' }
    ];
    const hits = filterSearchHits(items, (item) => [item.name, item.summary], 'tea', 2);
    assert.deepEqual(
      hits.map((item) => item.name),
      ['Garden tea tin', 'Teapot brush']
    );
  });
});
