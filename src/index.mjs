/**
 * footprint-conversation-chart: a conversation in, a checked storyboard out, by a footprintjs chart whose record says why each
 * choice was made. The model and the drawer are ports, so any tool that draws a storyboard can use it.
 *
 *   storyFromConversation({conversation, model, drawer, shape?, window?, mostFix?, cwd?})
 *     → {board, shape, standing, ask, stopped, problems, record}
 *   storySession({conversation, drawer, shape?, window?, mostFix?, cwd?, idleMs?})
 *     → {next(), answer(text), cancel()}: the same run, answered step by step from outside (an MCP host)
 *   inProcess(fn)    → a driver: fn(brief) answers {stage, instructions, material, expects, ids} with JSON text
 *   storyMermaid()   → the chart, drawn as Mermaid text
 *
 * A conversation is untrusted: its words go only into briefs, as material, apart from the instructions. The chart's state,
 * and so the record, holds counts, bytes, a hash, window offsets and message ordinals (a message's place in the
 * conversation), never a message's or an answer's words, nor a message's id. Refusals are fixed words; what caused one is
 * the rejection's `cause`, given to the caller after the record is taken.
 */
import {storyShapes} from 'footprint-story/storyboard';
import {storyWiring} from './story/chart.mjs';
import {buildChart, mermaidOf, runChart} from './story/engine.mjs';
import {inProcess, isDriver} from './story/port/port.mjs';
import {stepSession} from './story/port/step.mjs';
import {StoryRefusal, originalOf} from './story/refusal.mjs';
import {drawerOf} from './story/check/drawer.mjs';
import {MOST_FIX} from './story/check/stage.mjs';
import {WINDOW_BYTES} from './story/read-source/source.mjs';

export {inProcess};

const MOST_ROUNDS = 10;
const SHAPES = new Set(storyShapes().map((s) => s.name));

/** The run's input, checked: each refusal names the fix. */
function inputOf({conversation, model, drawer, shape, window = WINDOW_BYTES, mostFix = MOST_FIX, cwd = process.cwd()}) {
  if (!isDriver(model)) throw new TypeError('give the model as a driver: model: inProcess(async (brief) => answerText)');
  const drawn = drawerOf(drawer);
  if (shape !== undefined && !SHAPES.has(shape)) throw new TypeError(`no shape "${shape}": the shapes are ${[...SHAPES].join(', ')}, or leave shape out`);
  if (!Number.isInteger(mostFix) || mostFix < 0 || mostFix > MOST_ROUNDS) throw new RangeError(`mostFix is a whole number of fix rounds from 0 to ${MOST_ROUNDS}: give one, or leave it out for ${MOST_FIX}`);
  if (typeof cwd !== 'string') throw new TypeError('cwd is the folder a conversation file is read in, as a path: give one, or leave it out for this process\'s own');
  return {conversation, shape, drawer: drawn, window, mostFix, cwd};
}

/** One run's context: its input, the driver, and the working memory that holds every word. */
const runOf = (input, model) => ({input, model, source: null,
  work: {picks: [], points: [], board: null, written: null, problems: [], fixBriefs: null, roundStart: {}, rounds: {}, fixed: [], result: null}});

/** The standing as the caller reads it: each scene's sources by id again, from working memory (state holds ordinals). */
const withIds = (standing, source) => Object.fromEntries(Object.entries(standing).map(([id, s]) => [id, {...s, sources: s.sources.map((k) => source.idOf(k))}]));

/**
 * Run the chart: {board, shape, standing, ask, stopped, problems, record}. `board` is the read storyboard, or null when the
 * run stopped (`stopped` says where and why; `problems` lists what was left). `ask`: what only the owner can answer.
 * A model that throws rejects the run, its own error as the refusal's `cause`; so does any stage that fails.
 */
export async function storyFromConversation(options = {}) {
  const run = runOf(inputOf(options), options.model);
  let record;
  try { record = await runChart(buildChart(storyWiring(run))); } catch (error) {
    if (error instanceof StoryRefusal && originalOf(error) !== undefined) error.cause = originalOf(error);
    throw error;
  }
  const state = record.snapshot?.sharedState ?? {}, stopped = state.stopped ?? null;
  return Object.freeze({
    board: run.work.result, shape: state.shape ?? null, standing: withIds(state.standing ?? {}, run.source), ask: state.ask ?? [], stopped,
    problems: stopped ? run.work.problems.map(({at, message}) => ({at, message})) : [], record,
  });
}

/** A stand-in model for checking options before a session has its own driver. */
const UNSET = inProcess(() => '');

/**
 * The same run, step by step, for a host whose model answers from outside it (an MCP tool, where the calling assistant is
 * the model): {next(), answer(text), cancel()}, each step `{brief}` (the frozen brief) or `{result}` (what
 * storyFromConversation gives). The options are storyFromConversation's without `model`, plus `idleMs`. They are checked
 * at once; the run starts on the first next().
 */
export function storySession(options = {}) {
  if (options === null || typeof options !== 'object') throw new TypeError('give storySession its options: {conversation, drawer, ...}');
  const {model, idleMs, ...rest} = options;
  if (model !== undefined) throw new TypeError('storySession is the model\'s side itself: leave model out, and answer each brief with answer(text)');
  inputOf({...rest, model: UNSET});
  return stepSession((driver) => storyFromConversation({...rest, model: driver}), idleMs === undefined ? {} : {idleMs});
}

/** The chart, drawn as Mermaid text from the real chart (nothing runs). */
export const storyMermaid = () => mermaidOf(buildChart(storyWiring(runOf(inputOf({model: UNSET, drawer: {shapes: [...SHAPES].slice(0, 1)}}), null))));
