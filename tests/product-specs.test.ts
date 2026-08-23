import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const {
  mergeProductSpecs,
  productSpecsFromForm,
  readProductSpecs,
  specCompleteness,
  specFieldsFor,
  specGroupsFor,
  specInputName,
  specSections,
  SPEC_VALUE_MAX
} = await import('../lib/product-specs.ts');

describe('readProductSpecs', () => {
  it('keeps the fields the registry knows about', () => {
    assert.deepEqual(readProductSpecs({ light: 'Bright indirect light', water: 'When dry' }), {
      light: 'Bright indirect light',
      water: 'When dry'
    });
  });

  it('accepts JSON held as text, the way an older column might', () => {
    assert.deepEqual(readProductSpecs('{"steepTime":"5 minutes"}'), { steepTime: '5 minutes' });
    assert.deepEqual(readProductSpecs('not json'), {});
  });

  it('drops anything that is not a field with a value', () => {
    assert.deepEqual(
      readProductSpecs({
        // Not in the registry: a hand-edited key, or one a later release removed.
        favouriteColour: 'green',
        light: '   ',
        // An object would render as [object Object] in the specification table.
        water: { deep: 'nope' },
        difficulty: 'Easy'
      }),
      { difficulty: 'Easy' }
    );
    assert.deepEqual(readProductSpecs(null), {});
    assert.deepEqual(readProductSpecs([{ light: 'Bright' }]), {});
  });

  it('caps a single-line value so one paste cannot fill the page', () => {
    const long = 'x'.repeat(SPEC_VALUE_MAX + 200);
    assert.equal(readProductSpecs({ potSize: long }).potSize.length, SPEC_VALUE_MAX);
  });

  it('keeps the line breaks a list is written with, and collapses the rest', () => {
    assert.equal(
      readProductSpecs({ ingredients: 'Olive oil\n\n\n\nCoconut oil\nShea  butter' }).ingredients,
      'Olive oil\n\nCoconut oil\nShea butter'
    );
  });
});

describe('mergeProductSpecs', () => {
  it('writes what was posted for this kind of product', () => {
    assert.deepEqual(mergeProductSpecs(null, { light: 'Bright indirect light' }, 'PLANT'), {
      light: 'Bright indirect light'
    });
  });

  it('clears a field the owner emptied', () => {
    assert.deepEqual(mergeProductSpecs({ light: 'Bright' }, { light: '' }, 'PLANT'), {});
  });

  it('keeps what another kind asked for, so re-shelving loses nothing', () => {
    /**
     * Moving a soap to Apothecary and back should not destroy its ingredient
     * list. The tea fields below belong to no kind on screen, so the plant save
     * leaves them exactly where they were.
     */
    assert.deepEqual(mergeProductSpecs({ steepTime: '5 minutes' }, { light: 'Bright' }, 'PLANT'), {
      steepTime: '5 minutes',
      light: 'Bright'
    });
  });

  it('ignores a posted field this kind does not ask for', () => {
    assert.deepEqual(mergeProductSpecs(null, { steepTime: '5 minutes' }, 'PLANT'), {});
  });
});

describe('productSpecsFromForm', () => {
  it('reads the namespaced inputs the admin form posts', () => {
    const form = new FormData();
    form.append(specInputName('light'), 'Bright indirect light');
    form.append(specInputName('petSafety'), 'Toxic to cats and dogs if eaten');
    const posted = productSpecsFromForm(form, 'PLANT');
    assert.equal(posted.light, 'Bright indirect light');
    assert.equal(posted.petSafety, 'Toxic to cats and dogs if eaten');
    // Every field the kind asks for is read, whether or not it was filled in.
    assert.equal(posted.botanicalName, '');
  });
});

describe('specSections', () => {
  it('renders only the groups that have something in them', () => {
    const sections = specSections('TEA', { steepTime: '5–7 minutes', caffeine: 'Caffeine free' });
    assert.deepEqual(
      sections.map((section) => section.title),
      ['Brewing']
    );
    assert.deepEqual(
      sections[0].rows.map((row) => [row.label, row.value]),
      [
        ['Caffeine', 'Caffeine free'],
        ['Steep time', '5–7 minutes']
      ]
    );
  });

  it('renders nothing at all for a product with nothing filled in', () => {
    assert.deepEqual(specSections('PLANT', null), []);
  });

  it('marks the fields that need a paragraph rather than a cell', () => {
    const [section] = specSections('CARNIVOROUS_PLANT', {
      dormancy: 'Needs a cold winter rest.'
    });
    assert.equal(section.rows[0].long, true);
  });
});

describe('the registry itself', () => {
  it('asks a carnivorous plant everything a plant is asked, and more', () => {
    const plant = specFieldsFor('PLANT').map((field) => field.key);
    const carnivorous = specFieldsFor('CARNIVOROUS_PLANT').map((field) => field.key);
    for (const key of plant) assert.ok(carnivorous.includes(key), `missing ${key}`);
    for (const key of ['dormancy', 'waterType', 'growingMedium', 'feeding', 'species']) {
      assert.ok(carnivorous.includes(key), `missing ${key}`);
    }
  });

  it('never asks the same field twice within one kind', () => {
    for (const kind of [
      'PLANT',
      'CARNIVOROUS_PLANT',
      'TEA',
      'SOAP',
      'LOTION',
      'HARD_GOOD'
    ] as const) {
      const keys = specFieldsFor(kind).map((field) => field.key);
      assert.equal(new Set(keys).size, keys.length, `${kind} asks for a field twice`);
      assert.ok(specGroupsFor(kind).length > 0);
    }
  });

  it('counts how much of a listing is filled in', () => {
    const total = specFieldsFor('SOAP').length;
    assert.deepEqual(specCompleteness('SOAP', { scent: 'Lavender' }), { filled: 1, total });
    assert.deepEqual(specCompleteness('SOAP', null), { filled: 0, total });
  });
});
