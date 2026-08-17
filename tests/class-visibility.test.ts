import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL ||= 'https://thehillsidegardens.com';

const { CLASSES_EXIT_LINK, CLASSES_PUBLICLY_VISIBLE, pointsAtHiddenClasses } = await import(
  '../lib/class-visibility.ts'
);

describe('class visibility', () => {
  it('never exits a private classroom onto a page that is hidden', async () => {
    if (CLASSES_PUBLICLY_VISIBLE) {
      assert.equal(CLASSES_EXIT_LINK.href, '/classes');
      return;
    }

    // `/classes` answers 404 while classes are hidden, so the three dead ends in
    // the classroom and the confirmation page — an unpublished class, a missing
    // access cookie, a room that has closed — must not offer it as the way out.
    assert.notEqual(CLASSES_EXIT_LINK.href, '/classes');
    assert.ok(CLASSES_EXIT_LINK.label.trim().length > 0);
  });

  it('recognises an owner-entered link to the classes page', () => {
    const internal = [
      '/classes',
      '/classes/',
      '/classes#class-abc',
      '/classes?access=invalid',
      '/classes/studio/abc',
      '  /classes  ',
      'https://thehillsidegardens.com/classes#class-abc',
      // The URL parser drops a scheme's default port and lowercases the host
      // before `host` is read, so neither spelling is a way past the check.
      'https://thehillsidegardens.com:443/classes',
      'https://ThehillsideGardens.COM/classes'
    ];
    for (const url of internal) {
      assert.equal(pointsAtHiddenClasses(url), !CLASSES_PUBLICLY_VISIBLE, url);
    }

    // Left alone: other people's pages, the shop's own unrelated routes, and a
    // path that merely starts with the same letters.
    for (const url of [
      null,
      undefined,
      '',
      '   ',
      '/care',
      '/classesroom',
      '/shop/classes-starter-kit',
      'https://example.com/classes',
      // A non-default port is a different origin, not the shop.
      'https://thehillsidegardens.com:8443/classes',
      'not a url'
    ]) {
      assert.equal(pointsAtHiddenClasses(url), false, String(url));
    }
  });

  it('leaves the class machinery in place rather than deleting it', async () => {
    // Hiding is reversible; removal is not. If these ever disappear, flipping the
    // flag back would produce a storefront link to a feature that no longer runs.
    for (const path of [
      'app/api/classes/register/route.ts',
      'app/api/classes/checkout/route.ts',
      'app/classes/access/[token]/route.ts',
      'app/classes/studio/[id]/page.tsx',
      'app/classes/confirm/[token]/route.ts',
      'app/classes/confirmed/page.tsx',
      'lib/class-seats.ts',
      'lib/class-registration-email.ts'
    ]) {
      const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
      assert.ok(source.trim().length > 0, `${path} is empty`);
    }
  });
});
