import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { csvCell } from '../lib/csv.ts';

describe('csvCell', () => {
  it('quotes ordinary text', () => {
    assert.equal(csvCell('Oak Lane'), '"Oak Lane"');
  });

  it('escapes embedded quotes', () => {
    assert.equal(csvCell('12" pot'), '"12"" pot"');
  });

  it('neutralizes formula-leading characters', () => {
    assert.equal(csvCell('=HYPERLINK("http://evil")'), '"\'=HYPERLINK(""http://evil"")"');
    assert.equal(csvCell('+1-814-555-0100'), '"\'+1-814-555-0100"');
    assert.equal(csvCell('-refund'), '"\'-refund"');
    assert.equal(csvCell('@sum'), '"\'@sum"');
  });
});
