// The session reader is footprint-story's own. Its longest line is not exported, so the file reader keeps the same number:
// a line of exactly MOST_LINE is read, one more character is the reader's own "line-too-long".
import test from 'node:test';
import assert from 'node:assert/strict';
import {MOST_LINE, sessionReader} from '../src/story/read-source/session-reader.mjs';

const lineOf = (length) => {
  const head = '{"type":"user","message":{"content":"', tail = '"}}';
  return head + 'x'.repeat(length - head.length - tail.length) + tail;
};

test("MOST_LINE is the reader's own longest line", () => {
  const reader = sessionReader();
  reader.add(lineOf(MOST_LINE));
  reader.add(lineOf(MOST_LINE + 1));
  const {messages, left} = reader.result();
  assert.equal(messages.length, 1);
  assert.equal(left['line-too-long'], 1);
});
