import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { normalizeTimeline, readJson } from '../../skills/product-promo-video/scripts/lib.mjs';
import { scratch } from '../helpers.mjs';

test('scenes without a start follow each other and the total is their sum', () => {
  const tl = normalizeTimeline({ scenes: [{ id: 'a', dur: 2 }, { id: 'b', dur: 3.5 }, { id: 'c', start: 7, dur: 1 }] });
  assert.deepEqual(tl.scenes.map((s) => s.start), [0, 2, 7]);
  assert.equal(tl.total, 8);
  assert.equal(tl.fps, 30);
  assert.deepEqual([tl.width, tl.height], [1920, 1080]);
});

test('a written total and size win over the defaults', () => {
  const tl = normalizeTimeline({ total: 12, width: 1080, height: 1920, scenes: [{ id: 'a', dur: 2 }] });
  assert.equal(tl.total, 12);
  assert.deepEqual([tl.width, tl.height], [1080, 1920]);
});

test('JSON with a byte-order mark reads', (t) => {
  const f = join(scratch(t), 'bom.json');
  writeFileSync(f, '\uFEFF{"style":"pop"}');
  assert.deepEqual(readJson(f), { style: 'pop' });
});
