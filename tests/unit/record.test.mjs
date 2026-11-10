import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO, node, scratch } from '../helpers.mjs';

const recorder = join(REPO, 'skills', 'demo-screen-recording', 'scripts', 'record.mjs');
const flowScenario = join(REPO, 'skills', 'demo-screen-recording', 'scenarios', 'flow.mjs');

test('record refuses to overwrite an existing output or working directory', async (t) => {
  for (const [label, target] of [
    ['video', 'demo.webm'],
    ['screenshots', 'demo-shots'],
    ['temporary recording', '.demo-raw'],
  ]) {
    await t.test(label, (t) => {
      const dir = scratch(t, 'record-test-');
      const scenario = join(dir, 'scenario.mjs');
      const output = join(dir, 'demo.webm');
      const collision = join(dir, target);
      writeFileSync(scenario, "export const config = { name: 'demo' }; export default async () => true;\n");
      if (target.endsWith('-shots') || target.endsWith('-raw')) mkdirSync(collision);
      else writeFileSync(collision, 'keep this video');
      const before = target.endsWith('-shots') || target.endsWith('-raw') ? null : readFileSync(collision, 'utf8');

      const result = node(recorder, [scenario, output], { cwd: dir });

      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /refusing to overwrite existing recording output/);
      assert.ok(existsSync(collision));
      if (before !== null) assert.equal(readFileSync(collision, 'utf8'), before);
      assert.ok(!existsSync(target === 'demo.webm' ? join(dir, 'demo-shots') : output));
      assert.ok(!existsSync(target === '.demo-raw' ? join(dir, 'demo-shots') : join(dir, '.demo-raw')));
    });
  }
});

test('a browser that fails to start leaves nothing behind, so the next run is not blocked', (t) => {
  const dir = scratch(t, 'record-test-');
  const scenario = join(dir, 'scenario.mjs');
  writeFileSync(scenario, "export const config = { name: 'demo', url: 'about:blank', channel: 'no-such-browser' }; export default async () => true;\n");
  for (let run = 0; run < 2; run += 1) {
    const result = node(recorder, [scenario, join(dir, 'demo.webm')], { cwd: dir });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /refusing to overwrite/, `run ${run + 1}`);
    assert.deepEqual(readdirSync(dir), ['scenario.mjs'], `run ${run + 1} left files`);
  }
});

test('a flow with mistakes fails before the browser starts and names each one', (t) => {
  const dir = scratch(t, 'record-test-');
  const flow = join(dir, 'flow.json');
  writeFileSync(flow, JSON.stringify({
    config: { name: 'demo' },
    steps: [{ click: 'text=Go', shot: 'both' }, { fill: 'placeholder=/Ask/' }, { agent: { approve: '/^Run$/' } }, { waitText: '(' }],
  }));
  const result = node(recorder, [flowScenario, join(dir, 'demo.webm')], { cwd: dir, env: { FLOW: flow } });
  assert.notEqual(result.status, 0);
  for (const msg of [/config\.url is missing/, /step 1: expected exactly one of/, /step 2: fill needs "text"/, /step 3: agent needs "done"/, /step 4: Invalid regular expression/]) {
    assert.match(result.stderr, msg);
  }
  assert.deepEqual(readdirSync(dir), ['flow.json']);
});
