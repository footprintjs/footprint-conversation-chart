// storySession: the same run, answered step by step from outside it, as an MCP host whose calling assistant is the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {storyFromConversation, storySession} from '../src/index.mjs';
import {SessionEnded, SessionMisuse, stepSession} from '../src/story/port/step.mjs';
import {CHAT, FILM_DRAWER, PICKED, STORY, scripted} from './fakes.test.mjs';

const WRONG = {...STORY, checked: STORY.checked.map((c, i) => (i === 1 ? {...c, found: '26 hidden characters took 9999 ms'} : c))};
const options = {conversation: {messages: CHAT}, drawer: FILM_DRAWER};

/** The host's loop: each brief answered by `answerOf(brief)`, until the result. Gives {result, briefs}. */
async function drive(session, answerOf) {
  const briefs = [];
  let step = await session.next();
  while (step.brief) { briefs.push(step.brief); step = await session.answer(await answerOf(step.brief)); }
  return {result: step.result, briefs};
}

/** What two runs must share: everything on the result, the record's state and the narrative's words (its times aside). */
const untimed = (text) => (typeof text === 'string' ? text.replace(/\bin \d+ ?ms\b/g, 'in <t>ms') : text);
const comparable = ({record, ...rest}) => ({...rest, state: record.snapshot.sharedState, narrative: record.narrative.map((e) => [e.type, untimed(e.text)])});

for (const [name, script] of [
  ['one window, no fix', {pick: [PICKED], write: [STORY]}],
  ['a retried pick and a fix round', {pick: ['not json', PICKED], write: [WRONG], fix: [STORY.checked[1]]}],
  ['a run that stops at the limit', {pick: [PICKED], write: [WRONG], fix: [WRONG.checked[1]]}],
]) {
  test(`a run driven step by step equals the in-process run: ${name}`, async () => {
    const inProcessRun = scripted(script), stepped = scripted(script);
    const expected = await storyFromConversation({...options, model: inProcessRun.model});
    const {result, briefs} = await drive(storySession(options), (brief) => stepped.model.answer(brief));
    assert.deepEqual(comparable(result), comparable(expected));
    assert.deepEqual(briefs, inProcessRun.briefs, 'the same briefs, in the same order');
    for (const brief of briefs) {
      assert.deepEqual(Object.keys(brief), ['stage', 'instructions', 'material', 'expects', 'ids']);
      assert.ok(Object.isFrozen(brief) && Object.isFrozen(brief.ids));
    }
  });
}

test('next() with a brief waiting gives the same brief again; after the end it gives the same result again', async () => {
  const fake = scripted({pick: [PICKED], write: [STORY]}), session = storySession(options);
  const first = await session.next();
  assert.equal((await session.next()).brief, first.brief);
  const {result} = await drive({next: async () => first, answer: session.answer}, (b) => fake.model.answer(b));
  assert.equal((await session.next()).result, result);
});

test('misuse is refused in fixed words, and the session goes on', async () => {
  const fake = scripted({pick: [PICKED], write: [STORY]}), session = storySession(options);
  await assert.rejects(session.answer('{}'), (e) => e instanceof SessionMisuse && /no brief is waiting for an answer: call next\(\)/.test(e.message));
  const waiting = session.next();
  await assert.rejects(session.next(), (e) => e instanceof SessionMisuse && /already waiting/.test(e.message));
  const {brief} = await waiting;
  const answered = session.answer(await fake.model.answer(brief));
  await assert.rejects(session.answer('{}'), /already waiting/, 'one brief outstanding at a time: a second answer is refused');
  await assert.rejects(session.next(), /already waiting/);
  const {result} = await drive({next: () => answered, answer: session.answer}, (b) => fake.model.answer(b));
  assert.equal(result.stopped, null);
  await assert.rejects(session.answer('{}'), /the session has ended and its result was given/);
});

test('the options are checked at once, each refusal naming the fix', () => {
  assert.throws(() => storySession({...options, model: scripted({}).model}), /leave model out/);
  assert.throws(() => storySession({conversation: {messages: CHAT}}), /give the drawer/);
  assert.throws(() => storySession({...options, mostFix: 99}), /mostFix is a whole number/);
  for (const idleMs of [0, -1, 1.5, '10', 2 ** 31]) assert.throws(() => storySession({...options, idleMs}), /idleMs is a whole number of milliseconds/);
  assert.throws(() => storySession(null), /give storySession its options/);
});

test('a session left waiting for an answer ends after idleMs, and every later call gets that refusal', async () => {
  const session = storySession({...options, idleMs: 20});
  const {brief} = await session.next();
  assert.equal(brief.stage, 'pick');
  await new Promise((resolve) => setTimeout(resolve, 60));
  const ended = await session.next().catch((e) => e);
  assert.ok(ended instanceof SessionEnded);
  assert.match(ended.message, /waited 20 ms for the host and ended: start a new session/);
  await assert.rejects(session.answer(JSON.stringify(PICKED)), (e) => e === ended);
  await session.cancel();
});

test('a session never started ends when idle too', async () => {
  const session = storySession({...options, idleMs: 10});
  await new Promise((resolve) => setTimeout(resolve, 40));
  await assert.rejects(session.next(), SessionEnded);
});

test('the idle clock runs only while the session waits on the host, never while the chart works', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const session = stepSession(async (driver) => { const text = await driver.answer({stage: 'pick'}); await slow; return text; }, {idleMs: 30});
  await session.next();
  const done = session.answer('answered');
  await new Promise((resolve) => setTimeout(resolve, 80));
  release();
  assert.deepEqual(await done, {result: 'answered'});
});

test('cancel() ends the session: the waiting call is refused, the run winds down, later calls are refused', async () => {
  const session = storySession(options);
  await session.next();
  await session.cancel();
  await assert.rejects(session.next(), (e) => e instanceof SessionEnded && /cancelled/.test(e.message));
  await assert.rejects(session.answer('{}'), /cancelled/);
  const waiting = storySession(options), pending = waiting.next();
  await waiting.cancel();
  await assert.rejects(pending, /cancelled/, 'a call waiting when the session is cancelled is told');
});

test('a run that fails rejects the waiting call with the run\'s own refusal, its record and cause kept', async () => {
  const session = storySession({conversation: {messages: [{id: 'm1', text: 1}]}, drawer: FILM_DRAWER});
  const error = await session.next().catch((e) => e);
  assert.match(error.message, /storyboard door cannot use/);
  assert.ok(error.record && error.cause);
  await assert.rejects(session.next(), (e) => e === error);
});

test('options the run needs are checked at once, and the session errors are exported', async () => {
  const {storySession: start, SessionMisuse: Misuse, SessionEnded: Ended} = await import('../src/index.mjs');
  assert.equal(typeof Misuse, 'function');
  assert.equal(typeof Ended, 'function');
  assert.throws(() => start({conversation: {messages: CHAT}, drawer: FILM_DRAWER, window: 5}), /a window is a whole number of bytes/);
  assert.throws(() => start({conversation: null, drawer: FILM_DRAWER}), /give the conversation as/);
});

test('a non-text answer is refused before the brief is taken, and the brief still waits', async () => {
  const session = storySession({conversation: {messages: CHAT}, drawer: FILM_DRAWER});
  const {brief} = await session.next();
  await assert.rejects(session.answer({not: 'text'}), (e) => e instanceof SessionMisuse && /JSON text/.test(e.message));
  assert.deepEqual((await session.next()).brief, brief);
  await session.cancel();
});

test('a cancel in the same tick as the first next() starts no run', async () => {
  let read = 0;
  const conversation = {get messages() { read++; return CHAT; }};
  const session = storySession({conversation, drawer: FILM_DRAWER});
  const step = session.next();
  await session.cancel();
  await assert.rejects(step, SessionEnded);
  assert.ok(read <= 1, 'the conversation is not opened by a run that never started');
});
