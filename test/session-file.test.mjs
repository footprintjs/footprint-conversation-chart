// A chatbot session file as the conversation: read a line at a time inside the project only, what the reader leaves out
// counted (never named), and the same stamp-and-hash check a JSON file gets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {storyFromConversation} from '../src/index.mjs';
import {openSource} from '../src/story/read-source/source.mjs';
import {StoryRefusal} from '../src/story/refusal.mjs';
import {CHAT, FILM_DRAWER, PICKED, STORY, scripted} from './fakes.test.mjs';

/** A session file's lines for the example conversation: a person's turn, then an assistant's, with host noise between. */
function sessionLines(messages = CHAT) {
  const lines = [JSON.stringify({type: 'summary', summary: 'SECRETKIND notes'})];
  messages.forEach((m, i) => {
    const type = i % 2 ? 'assistant' : 'user', content = type === 'user' ? m.text : [{type: 'text', text: m.text}];
    lines.push(JSON.stringify({type, message: {role: type, content}}));
    if (type === 'assistant') lines.push(JSON.stringify({type: 'user', message: {content: [{type: 'tool_result', content: 'SECRETTOOL output'}]}}));
  });
  lines.push('not json SECRETLINE', JSON.stringify({type: 'SECRETKIND-named-by-the-file'}));
  return lines.join('\n') + '\n';
}

/** The ids the session reader gives the example conversation, in order: m1, m2, ... (who alternates). */
const asRead = CHAT.map((m, i) => ({id: `m${i + 1}`, who: i % 2 ? 'assistant' : 'person', text: m.text}));

async function inFolder(fn) {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'story-session-')));
  try { await fn(cwd); } finally { rmSync(cwd, {recursive: true, force: true}); }
}

test('a session file is read a line at a time into the conversation the reader gives, its left-out records counted', () => inFolder(async (cwd) => {
  writeFileSync(path.join(cwd, 'session.jsonl'), sessionLines());
  const source = await openSource({session: 'session.jsonl'}, {cwd});
  assert.deepEqual(await source.all(), asRead);
  assert.equal(source.facts.messages, CHAT.length);
  assert.equal(source.facts.skipped, 5, 'a summary, two tool results, a line that is not JSON, an unknown kind');
}));

test('a session runs the whole chart, and no word, line or record kind of the file reaches the record', () => inFolder(async (cwd) => {
  writeFileSync(path.join(cwd, 'session.jsonl'), sessionLines(CHAT.map((m) => ({...m, text: `${m.text} SECRETWORDS`}))));
  const fake = scripted({pick: [PICKED], write: [STORY]});
  const result = await storyFromConversation({conversation: {session: 'session.jsonl'}, cwd, model: fake.model, drawer: FILM_DRAWER});
  assert.equal(result.stopped, null);
  assert.equal(result.shape, 'what-we-found');
  assert.equal(result.record.snapshot.sharedState.source.skipped, 5);
  const record = JSON.stringify(result.record);
  for (const words of ['SECRETWORDS', 'SECRETKIND', 'SECRETTOOL', 'SECRETLINE']) assert.ok(!record.includes(words), `"${words}" is not in the record`);
  assert.ok(fake.briefs.some((b) => b.material.includes('SECRETWORDS')), 'the words reach the model as material');
}));

test('a session file is read inside the project only, by its real path, and must be a file', () => inFolder(async (cwd) => {
  const outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'story-outside-')));
  try {
    writeFileSync(path.join(outside, 'session.jsonl'), sessionLines());
    symlinkSync(path.join(outside, 'session.jsonl'), path.join(cwd, 'link.jsonl'));
    mkdirSync(path.join(cwd, 'folder.jsonl'));
    await assert.rejects(openSource({session: '../outside.jsonl'}, {cwd}), (e) => e instanceof StoryRefusal && /outside this project/.test(e.message));
    await assert.rejects(openSource({session: path.join(outside, 'session.jsonl')}, {cwd}), /outside this project/);
    await assert.rejects(openSource({session: 'link.jsonl'}, {cwd}), /outside this project/, 'a link cannot lead out');
    await assert.rejects(openSource({session: 'folder.jsonl'}, {cwd}), /no session file "folder.jsonl": name a session file \(one JSON record per line\)/);
    await assert.rejects(openSource({session: 'none.jsonl'}, {cwd}), /no session file "none.jsonl"/);
  } finally { rmSync(outside, {recursive: true, force: true}); }
}));

test('a JSON conversation file cannot be a link out of the project either', () => inFolder(async (cwd) => {
  const outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'story-outside-')));
  try {
    writeFileSync(path.join(outside, 'chat.json'), JSON.stringify(CHAT));
    symlinkSync(path.join(outside, 'chat.json'), path.join(cwd, 'chat.json'));
    await assert.rejects(openSource({file: 'chat.json'}, {cwd}), /outside this project/);
  } finally { rmSync(outside, {recursive: true, force: true}); }
}));

test('a session with nothing a person or the assistant said is refused, naming the fix, quoting nothing', () => inFolder(async (cwd) => {
  writeFileSync(path.join(cwd, 'empty.jsonl'), 'SECRETLINE\n{"type":"summary"}\n');
  await assert.rejects(openSource({session: 'empty.jsonl'}, {cwd}), (e) => /holds no message a person or the assistant wrote/.test(e.message) && !e.message.includes('SECRETLINE'));
}));

test('a session file changed during the run is read again and refused unless its words hash the same', () => inFolder(async (cwd) => {
  const file = path.join(cwd, 'session.jsonl');
  writeFileSync(file, sessionLines());
  const source = await openSource({session: 'session.jsonl'}, {cwd});
  writeFileSync(file, `${sessionLines()}{"type":"summary"}\n`);   // a new stamp, the same words: hashed, and accepted
  assert.equal((await source.window(0)).length, CHAT.length);
  writeFileSync(file, sessionLines(CHAT.map((m) => ({...m, text: `${m.text} and more`}))));
  await assert.rejects(source.window(0), /changed during the run.*run again/);
}));
