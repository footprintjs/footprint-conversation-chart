// The vendored session reader: a temporary copy of footprint-story's, byte for byte below its header, reached through one
// module only, so the swap to `footprint-story/storyboard` (0.8.0) is one line.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const src = fileURLToPath(new URL('../src/', import.meta.url));
/** footprint-story src/storyboard/session.js at commit a907e70. */
const UPSTREAM_SHA256 = '32e4641d31af0f230597483a153c6776bcadf8967f47c7b33fbbfb64a24d0cb9';
const HEADER_LINES = 4;

test('the vendored reader says it is a temporary copy, and is the upstream file byte for byte below that', () => {
  const lines = readFileSync(path.join(src, 'vendor/session.js'), 'utf8').split('\n');
  assert.match(lines.slice(0, HEADER_LINES).join('\n'), /TEMPORARY COPY.*until footprint-story 0\.8\.0/s);
  const body = lines.slice(HEADER_LINES).join('\n');
  assert.equal(createHash('sha256').update(body).digest('hex'), UPSTREAM_SHA256);
});

test('one module reaches the vendored reader', () => {
  const importing = readdirSync(src, {recursive: true}).filter((f) => /\.m?js$/.test(f) && !f.startsWith('vendor'))
    .filter((f) => /vendor\/session\.js/.test(readFileSync(path.join(src, f), 'utf8')));
  assert.deepEqual(importing, [path.join('story', 'read-source', 'session-reader.mjs')]);
});
