/** The read-source stage: the conversation opened as a source, and only its facts written to state. */
import {openSource} from './source.mjs';

export async function readSource(scope, run) {
  run.source = await openSource(run.input.conversation, {cwd: run.input.cwd, window: run.input.window});
  const {messages, bytes, sha256, clipped, window, windows, skipped} = run.source.facts;
  // `skipped` (a session's records the reader left out: tool calls, host notes, odd lines) is a count only; the kinds it
  // counts by are named by the file, so they never reach state
  scope.source = {messages, bytes, sha256, clipped, ...(skipped === undefined ? {} : {skipped})};
  scope.windowBytes = window;
  scope.windows = windows.map(({from, to, bytes: size}) => ({from, to, bytes: size}));
  scope.windowCount = windows.length;
}
