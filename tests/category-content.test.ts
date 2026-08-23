import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FAQ_MAX_ENTRIES,
  categoryDescription,
  faqLines,
  parseFaqLines,
  parseKeywords,
  proseBlocks,
  readFaq
} from '../lib/category-content.ts';

describe('parseFaqLines and faqLines', () => {
  it('reads one question and answer per line', () => {
    const parsed = parseFaqLines(
      'How often should I water this? | Check the soil, not the calendar.\nIs it pet safe? | Yes.'
    );
    assert.deepEqual(parsed, [
      { question: 'How often should I water this?', answer: 'Check the soil, not the calendar.' },
      { question: 'Is it pet safe?', answer: 'Yes.' }
    ]);
  });

  it('drops a question nobody answered rather than publishing an empty answer', () => {
    // An FAQ entry with no answer is invalid structured data and useless copy.
    assert.deepEqual(parseFaqLines('What about this one?\nAnd this? |   '), []);
  });

  it('keeps a pipe inside the answer with the answer', () => {
    const [entry] = parseFaqLines('Which soil? | Use a gritty mix | not garden soil.');
    assert.equal(entry.answer, 'Use a gritty mix | not garden soil.');
  });

  it('round-trips back into editable lines', () => {
    const text = 'Is it pet safe? | Yes.';
    assert.equal(faqLines(parseFaqLines(text)), text);
  });

  it('caps how many questions one page carries', () => {
    const many = Array.from(
      { length: FAQ_MAX_ENTRIES + 5 },
      (_, index) => `Q${index}? | A${index}`
    );
    assert.equal(parseFaqLines(many.join('\n')).length, FAQ_MAX_ENTRIES);
  });
});

describe('readFaq', () => {
  it('treats anything that is not the stored shape as no questions', () => {
    assert.deepEqual(readFaq(null), []);
    assert.deepEqual(readFaq('not an array'), []);
    assert.deepEqual(readFaq([{ q: 'wrong', a: 'shape' }]), []);
    assert.deepEqual(readFaq([{ question: 'Kept?', answer: 'Yes' }, null, 7]), [
      { question: 'Kept?', answer: 'Yes' }
    ]);
  });
});

describe('proseBlocks', () => {
  it('splits on blank lines and promotes a short line ending in a colon', () => {
    const blocks = proseBlocks('Choosing one:\n\nStart with the room.\n\nAnd then the light.');
    assert.deepEqual(blocks, [
      { kind: 'heading', text: 'Choosing one' },
      { kind: 'paragraph', text: 'Start with the room.' },
      { kind: 'paragraph', text: 'And then the light.' }
    ]);
  });

  it('leaves a long sentence ending in a colon as a paragraph', () => {
    const long = `${'The reason this matters is simple and worth spelling out at length'.repeat(2)}:`;
    assert.equal(proseBlocks(long)[0].kind, 'paragraph');
  });

  it('is empty for nothing', () => {
    assert.deepEqual(proseBlocks(''), []);
    assert.deepEqual(proseBlocks(null), []);
    assert.deepEqual(proseBlocks('   \n\n  '), []);
  });
});

describe('parseKeywords', () => {
  it('splits on commas and newlines, lowercases and deduplicates', () => {
    assert.deepEqual(parseKeywords('Venus Flytrap, pitcher plant\nvenus flytrap'), [
      'venus flytrap',
      'pitcher plant'
    ]);
  });

  it('stops at the limit', () => {
    assert.equal(parseKeywords('a,b,c,d,e', 3).length, 3);
  });
});

describe('categoryDescription', () => {
  it('prefers what the owner wrote for search results', () => {
    assert.equal(
      categoryDescription({
        title: 'Succulents',
        metaDescription: 'Bright-window plants.',
        intro: 'Something longer.'
      }),
      'Bright-window plants.'
    );
  });

  it('falls back through the introduction and the description before inventing one', () => {
    assert.equal(
      categoryDescription({ title: 'Succulents', intro: 'Store their own water.' }),
      'Store their own water.'
    );
    /**
     * The last-resort sentence names neither "collection" nor "category": it
     * serves both kinds of grouping, and a category with no copy of its own used
     * to introduce itself as a collection.
     */
    const invented = categoryDescription({ title: 'Succulents' });
    assert.match(invented, /^Shop Succulents at The Hillside Gardens/);
    assert.equal(invented.includes('collection'), false);
    assert.equal(invented.includes('category'), false);
  });

  it('truncates on a word boundary rather than mid-word', () => {
    const description = categoryDescription({ title: 'Long', intro: 'word '.repeat(80) });
    assert.ok(description.length <= 160);
    assert.ok(description.endsWith('…'));
    assert.equal(description.includes('  '), false);
  });
});
