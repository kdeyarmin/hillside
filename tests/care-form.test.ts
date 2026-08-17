import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adminCarePath, parseCareGuideInput, slugifyCare } from '../lib/care-form.ts';

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe('slugifyCare', () => {
  it('falls back from a punctuation-only slug to the plant name', () => {
    assert.equal(slugifyCare('!!!'), '');
    assert.equal(slugifyCare('Monstera Deliciosa'), 'monstera-deliciosa');
  });
});

describe('parseCareGuideInput', () => {
  it('refuses a guide with no main guidance', () => {
    const parsed = parseCareGuideInput(
      form({
        plantName: 'Yellow leaves',
        slug: 'yellow-leaves',
        summary: 'A common complaint.',
        guideType: 'PROBLEM'
      })
    );
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.reason, 'required');
    assert.equal(parsed.slug, 'yellow-leaves');
  });

  it('keeps the chosen guide type and leaves empty diagnostics as null', () => {
    const parsed = parseCareGuideInput(
      form({
        plantName: 'Monstera Deliciosa',
        slug: 'monstera-deliciosa',
        guideType: 'PLANT',
        summary: 'A reliable indoor climber.',
        tips: 'Let the top inch of soil dry.',
        light: 'Bright indirect',
        featured: 'on',
        published: 'true'
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.data.guideType, 'PLANT');
    assert.equal(parsed.data.light, 'Bright indirect');
    assert.equal(parsed.data.featured, true);
    assert.equal(parsed.data.published, true);
    assert.equal(parsed.data.symptoms, null);
    assert.equal(parsed.data.causes, null);
    assert.equal(parsed.data.treatment, null);
    assert.equal(parsed.data.checklist, null);
  });

  it('builds a slug from the title when the slug field is empty or punctuation', () => {
    const parsed = parseCareGuideInput(
      form({
        plantName: 'Why Are My Leaves Yellow?',
        slug: '!!!',
        summary: 'A common complaint.',
        tips: 'Check watering first.',
        guideType: 'PROBLEM'
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.data.slug, 'why-are-my-leaves-yellow');
    assert.equal(parsed.data.guideType, 'PROBLEM');
  });
});

describe('adminCarePath', () => {
  it('keeps the editor on the row that was just saved', () => {
    assert.equal(adminCarePath(), '/admin/care');
    assert.equal(
      adminCarePath({ saved: 'monstera-deliciosa', error: undefined }),
      '/admin/care?saved=monstera-deliciosa'
    );
  });
});
