/**
 * The check: the existing readers, unchanged. footprint-story's storyboardProblems reads the board against the whole
 * conversation; once it reads, the drawer's own reader (`drawer.problemsOf`, when the tool has one) adds what the tool cannot
 * draw. The problems are grouped into pieces by storyboardFixBriefs, so each piece at fault can be sent back on its own.
 * Code only.
 */
import {readStoryboard, storyboardFixBriefs, storyboardProblems} from 'footprint-story/storyboard';
import {drawerProblems} from './drawer.mjs';

/** Every problem of the board: the storyboard's own, then, once it reads and is a shape the drawer draws, the drawer's. */
export async function problemsOf(board, conversation, drawer) {
  const problems = storyboardProblems(board, {conversation});
  if (problems.length) return problems;
  const read = readStoryboard(board, {conversation});
  if (!drawer.shapes.includes(read.shape)) return [];
  return drawerProblems(drawer, read);
}

/** The note the reader adds when it lists only the first problems: not a problem of its own. */
const isMoreNote = (problem) => problem.at === '';

/**
 * {problems, fixBriefs, facts}: the problems, one fix brief per piece at fault, and what state may hold of them: counts and
 * the pieces' names (code writes those names, never the board).
 */
export async function checkBoard(board, conversation, drawer) {
  const problems = await problemsOf(board, conversation, drawer), fixBriefs = storyboardFixBriefs(board, problems, {conversation});
  const facts = {
    problemCount: problems.length,
    unpieced: fixBriefs.rest.filter((p) => !isMoreNote(p)).length,
    pieces: fixBriefs.briefs.map((b) => ({piece: b.piece, problems: b.problems.length})),
  };
  return {problems, fixBriefs, facts};
}
