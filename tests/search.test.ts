import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  editDistanceWithin,
  filterSearchHits,
  matchesAnySearchField,
  matchesSearchTerm,
  matchesSearchTermFuzzy,
  rankSearchHits,
  searchScore,
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

  it('keeps accented letters as their own tokens', () => {
    assert.deepEqual(tokenizeSearch('café'), ['café']);
    assert.deepEqual(tokenizeSearch('théière blend'), ['théière', 'blend']);
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

  it('matches café against Café blend, not against a substring of another word', () => {
    assert.equal(matchesSearchTerm('Café blend', 'café'), true);
    assert.equal(matchesSearchTerm('Loose-leaf café', 'café'), true);
    assert.equal(matchesSearchTerm('decaffeinated leaves', 'café'), false);
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

describe('editDistanceWithin', () => {
  it('answers whether two words are within an edit budget, not how far apart they are', () => {
    assert.equal(editDistanceWithin('monstera', 'monstara', 1), true);
    assert.equal(editDistanceWithin('succulent', 'succulant', 1), true);
    assert.equal(editDistanceWithin('pothos', 'photos', 1), false);
    assert.equal(editDistanceWithin('pothos', 'photos', 2), true);
    assert.equal(editDistanceWithin('tea', 'tea', 0), true);
  });

  it('rejects on length alone before doing any work', () => {
    assert.equal(editDistanceWithin('moss', 'mossiness', 1), false);
  });
});

describe('matchesSearchTermFuzzy', () => {
  it('forgives a typo in a word long enough to be sure about', () => {
    assert.equal(matchesSearchTermFuzzy('Monstera Deliciosa', 'monstara'), true);
    assert.equal(matchesSearchTermFuzzy('Assorted succulents', 'succulant'), true);
    assert.equal(matchesSearchTermFuzzy('Carnivorous plants', 'carnivorus'), true);
  });

  /**
   * The three-letter floor is what keeps the original regression fixed: at that
   * length nearly everything is one edit from something else.
   */
  it('never fuzzy-matches a short word, so tea still does not reach sea or steady', () => {
    assert.equal(matchesSearchTermFuzzy('Sea salt soap', 'tea'), false);
    assert.equal(matchesSearchTermFuzzy('Bright light and steady watering.', 'tea'), false);
    assert.equal(matchesSearchTermFuzzy('A monstera that prefers moisture.', 'tea'), false);
    // "team" is still a hit, but through the start-of-word prefix rule that
    // makes "tea" find "teapot" — not through any typo tolerance.
    assert.equal(matchesSearchTerm('A team of gardeners', 'tea'), true);
  });

  it('still prefers a real match and requires every token', () => {
    assert.equal(matchesSearchTermFuzzy('Chamomile tea', 'tea'), true);
    assert.equal(matchesSearchTermFuzzy('Pet safe pothos', 'pet safe'), true);
    assert.equal(matchesSearchTermFuzzy('Pet safe pothos', 'pet carnivorous'), false);
  });
});

describe('searchScore and rankSearchHits', () => {
  const items = [
    { name: 'Golden Pothos', body: 'A trailing plant for low light.' },
    { name: 'Potting mix', body: 'Blended for pothos and philodendron.' },
    { name: 'Ceramic planter', body: 'Fits a six inch pot.' }
  ];
  const fieldsFor = (item: (typeof items)[number]) => ({
    primary: [item.name],
    secondary: [item.body]
  });

  it('scores a name match above a mention in the body copy', () => {
    assert.ok(
      searchScore(['Golden Pothos'], ['A trailing plant.'], 'pothos') >
        searchScore(['Potting mix'], ['Blended for pothos.'], 'pothos')
    );
  });

  it('returns nothing at all for a term that matches neither', () => {
    assert.equal(searchScore(['Golden Pothos'], ['Trailing.'], 'carnivorous'), 0);
    assert.equal(searchScore(['Golden Pothos'], ['Trailing.'], '   '), 0);
  });

  it('ranks hits best first and drops the misses', () => {
    assert.deepEqual(
      rankSearchHits(items, fieldsFor, 'pothos').map((item) => item.name),
      ['Golden Pothos', 'Potting mix']
    );
  });

  it('honours the limit', () => {
    assert.equal(rankSearchHits(items, fieldsFor, 'pothos', 1).length, 1);
  });
});
