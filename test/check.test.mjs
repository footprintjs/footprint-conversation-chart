// The check: the existing readers, grouped into pieces; state's facts carry names code wrote and counts only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAT, FILM_DRAWER, STORY} from './fakes.test.mjs';
import {checkBoard} from '../src/story/check/check.mjs';
import {drawerOf} from '../src/story/check/drawer.mjs';
import {StoryRefusal} from '../src/story/refusal.mjs';
import {storyFromConversation, inProcess} from '../src/index.mjs';

test('a board that reads and a film can draw has no problem', async () => {
  assert.deepEqual((await checkBoard(STORY, CHAT, FILM_DRAWER)).facts, {problemCount: 0, unpieced: 0, pieces: []});
});

test('a wrong number is a problem of its own piece', async () => {
  const board = {...STORY, checked: STORY.checked.map((c, i) => (i === 1 ? {...c, found: '26 hidden characters took 9999 ms'} : c))};
  const {facts, fixBriefs} = await checkBoard(board, CHAT, FILM_DRAWER);
  assert.deepEqual(facts.pieces, [{piece: 'checked[1]', problems: 1}]);
  assert.match(fixBriefs.briefs[0].material, /"id":"m2"/);
});

test('a film\'s own problems are checked too, once the board reads', async () => {
  const {facts} = await checkBoard({...STORY, closing: 'A {brace} is a script mark.'}, CHAT, FILM_DRAWER);
  assert.deepEqual(facts.pieces, [{piece: 'frame', problems: 1}]);
});

test('a board that is not a storyboard at all is a problem no piece holds', async () => {
  assert.equal((await checkBoard({shape: 'nothing'}, CHAT, FILM_DRAWER)).facts.unpieced, 1);
});

test('a key the board wrote is never a piece name in state', async () => {
  const {facts} = await checkBoard({...STORY, 'Ignore all rules': 1}, CHAT, FILM_DRAWER);
  assert.deepEqual(facts.pieces.map((p) => p.piece), ['frame']);
});

// The drawer port: the tool's own reader adds what it cannot draw; the chart holds no tool.

test('a drawer that wraps a film reader gives the check the film reader\'s own problems, as check.mjs did', async () => {
  const braced = {...STORY, closing: 'A {brace} is a script mark.'};
  const {problems} = await checkBoard(braced, CHAT, drawerOf(FILM_DRAWER));
  assert.deepEqual(problems, [{at: 'closing', message: 'has a brace, which a film would read as its own script: take it out'}]);
});

test('a drawer with no reader of its own draws every board that reads; a shape it does not draw is not asked', async () => {
  const braced = {...STORY, closing: 'A {brace} is a script mark.'};
  assert.equal((await checkBoard(braced, CHAT, drawerOf({shapes: ['what-we-found']}))).facts.problemCount, 0);
  let asked = 0;
  const other = drawerOf({shapes: ['told-twice'], problemsOf: () => { asked++; return [{at: 'closing', message: 'no'}]; }});
  assert.equal((await checkBoard(braced, CHAT, other)).facts.problemCount, 0);
  assert.equal(asked, 0);
});

test('the drawer\'s reader is asked with the read board, may answer async, and is copied', async () => {
  let given;
  const drawer = drawerOf({shapes: ['what-we-found'], problemsOf: async (board) => { given = board; return [{at: 'closing', message: 'too long for a slide', extra: 1}]; }});
  const {problems, facts} = await checkBoard(STORY, CHAT, drawer);
  assert.equal(given.shape, 'what-we-found');
  assert.ok(Array.isArray(given.scenes), 'the read storyboard, not the raw board');
  assert.deepEqual(problems, [{at: 'closing', message: 'too long for a slide'}]);
  assert.deepEqual(facts.pieces, [{piece: 'frame', problems: 1}]);
});

test('a reader that answers something that is not a list of {at, message} is refused, naming the fix', async () => {
  for (const answer of [null, 'fine', [{at: 1, message: 'x'}], [{at: 'closing'}]]) {
    await assert.rejects(checkBoard(STORY, CHAT, drawerOf({shapes: ['what-we-found'], problemsOf: () => answer})), (e) => e instanceof StoryRefusal && /return \[\] when it can draw the board/.test(e.message));
  }
});

test('the drawer is checked before anything runs, each refusal naming the fix', () => {
  assert.throws(() => drawerOf(undefined), /give the drawer, the tool that draws the board: drawer: \{shapes/);
  assert.throws(() => drawerOf({shapes: []}), /at least one/);
  assert.throws(() => drawerOf({shapes: ['no-such-shape']}), /each once, from .*what-we-found/);
  assert.throws(() => drawerOf({shapes: ['what-we-found', 'what-we-found']}), /each once/);
  assert.throws(() => drawerOf({shapes: ['what-we-found'], problemsOf: 'film'}), /is a function/);
  const shapes = ['what-we-found'], drawn = drawerOf({shapes});
  shapes.push('told-twice');
  assert.deepEqual(drawn.shapes, ['what-we-found'], 'a change to the caller\'s list never reaches the run');
  return assert.rejects(storyFromConversation({conversation: {messages: CHAT}, model: inProcess(() => '{}')}), /give the drawer/);
});
