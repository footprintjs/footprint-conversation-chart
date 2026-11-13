/**
 * The drawer, as a port: the tool that will draw the board (a film, a deck). It says which shapes it draws and, when it has
 * one, its own reader: `problemsOf(board)` → [{at, message}], what it cannot draw, each at the board's place. The chart holds
 * no tool: StoryReel passes its film reader, StoryDeck its deck's. Checked once at the start, in refusals that name the fix;
 * its answer is checked each time it is asked.
 */
import {storyShapes} from 'footprint-story/storyboard';
import {StoryRefusal} from '../refusal.mjs';

const SHAPES = () => storyShapes().map((s) => s.name);
const FORM = "drawer: {shapes: ['what-we-found'], problemsOf?(board) => [{at, message}]}";
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The drawer checked and copied (a change to the caller's object cannot reach the run): {shapes, problemsOf | null}. */
export function drawerOf(drawer) {
  if (!isRecord(drawer)) throw new TypeError(`give the drawer, the tool that draws the board: ${FORM}`);
  const {shapes, problemsOf} = drawer, known = SHAPES();
  if (!Array.isArray(shapes) || !shapes.length || !shapes.every((name) => known.includes(name)) || new Set(shapes).size !== shapes.length) {
    throw new TypeError(`drawer.shapes lists the shapes the drawer draws, each once, from ${known.join(', ')}: give at least one`);
  }
  if (problemsOf !== undefined && typeof problemsOf !== 'function') throw new TypeError('drawer.problemsOf, when given, is a function: (board) => [{at, message}], what the tool cannot draw; leave it out when it draws every board that reads');
  return Object.freeze({shapes: Object.freeze([...shapes]), problemsOf: problemsOf ? (board) => problemsOf.call(drawer, board) : null});
}

/** What the drawer cannot draw of a board that reads: [{at, message}], copied; a refusal when its answer is not that. */
export async function drawerProblems(drawer, read) {
  if (!drawer.problemsOf) return [];
  const list = await drawer.problemsOf(read);
  if (!Array.isArray(list) || !list.every((p) => isRecord(p) && typeof p.at === 'string' && typeof p.message === 'string')) {
    throw new StoryRefusal('the drawer\'s problemsOf gave something that is not a list of {at, message}: return [] when it can draw the board');
  }
  return list.map(({at, message}) => ({at, message}));
}
