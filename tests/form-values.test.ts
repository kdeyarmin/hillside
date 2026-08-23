import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formInteger } from '../lib/form-values.ts';

describe('formInteger', () => {
  /**
   * The live regression. `Number(null)` and `Number('')` are both 0, and 0 is
   * finite, so a `Number.isFinite` guard returned zero for a field the form had
   * not sent — and the class form's duration, join-open and join-close defaults
   * could never be reached. Clearing the duration box saved a class of
   * `Math.max(15, 0)` minutes instead of the 90 the field promised.
   */
  it('falls back for a field that is absent or empty', () => {
    assert.equal(formInteger(null, 90), 90);
    assert.equal(formInteger(undefined, 90), 90);
    assert.equal(formInteger('', 90), 90);
    assert.equal(formInteger('   ', 90), 90);
  });

  it('still reads a real number, including an explicit zero', () => {
    assert.equal(formInteger('0', 90), 0);
    assert.equal(formInteger('45', 90), 45);
    assert.equal(formInteger(' 45 ', 90), 45);
    assert.equal(formInteger('-3', 90), -3);
  });

  it('floors rather than rounds, so a fraction cannot inflate a count', () => {
    assert.equal(formInteger('4.9'), 4);
    assert.equal(formInteger('-4.1'), -5);
  });

  it('falls back for anything that is not a number at all', () => {
    assert.equal(formInteger('ninety', 90), 90);
    assert.equal(formInteger('12abc', 90), 90);
    assert.equal(formInteger(new File([], 'photo.jpg'), 90), 90);
  });

  it('reads straight off a FormData, the way every caller does', () => {
    const form = new FormData();
    form.set('durationMinutes', '');
    assert.equal(formInteger(form.get('durationMinutes'), 90), 90);
    assert.equal(formInteger(form.get('joinOpensMinutesBefore'), 30), 30);
    form.set('capacity', '12');
    assert.equal(formInteger(form.get('capacity'), 12), 12);
  });
});
