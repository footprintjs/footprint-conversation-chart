/**
 * A conversation's file, read only inside the project: by its real path (so a link cannot lead out), a regular file, under
 * the size its kind may be. Refusals name the file as the caller gave it and the fix, and never quote what the file holds:
 * a JSON parser's own message quotes the text it read, so it is never used. A session file (one JSON record per line) is
 * read a line at a time with node:readline and handed to the session reader, never held as one string.
 */
import {createReadStream, existsSync, readFileSync, realpathSync, statSync} from 'node:fs';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {sessionReader} from './session-reader.mjs';

/** The most bytes each kind of file may be. A session is read a line at a time, so it may be larger than a JSON list. */
export const MOST_FILE_BYTES = Object.freeze({conversation: 32 << 20, session: 256 << 20});

/** What each kind of file is, in a refusal's words. */
const KIND = Object.freeze({conversation: 'a JSON file', session: 'a session file (one JSON record per line)'});

/** A path the project holds, by its real path: the file's full path, or a refusal naming the fix. */
function inProject(file, what, cwd) {
  const full = path.resolve(cwd, file), root = realpathSync(cwd);
  let existing = full;
  while (!existsSync(existing)) existing = path.dirname(existing);
  const real = realpathSync(existing);
  if (real !== root && !real.startsWith(root + path.sep)) throw new Error(`${what} "${file}" is outside this project: run this from the folder that holds it`);
  return full;
}

/** Where the file is and what it is, refused first and nothing read: its full path. `what`: 'conversation' or 'session'. */
export function checkFile(file, what, cwd) {
  const full = inProject(file, what, cwd);
  if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`no ${what} file "${file}": name ${KIND[what]} in this project`);
  if (statSync(full).size > MOST_FILE_BYTES[what]) throw new Error(`${what} "${file}" is too big: ${MOST_FILE_BYTES[what]} bytes is the most`);
  return full;
}

/** A JSON file checked by checkFile: its value, or a refusal that does not quote it. */
export function readJsonFile(full, file) {
  try { return JSON.parse(readFileSync(full, 'utf8')); } catch { throw new Error(`conversation "${file}" is not valid JSON: fix it so it parses, then run again`); }
}

/** A session file checked by checkFile, a line at a time: {messages, left}, as the session reader gives them. */
export async function readSessionFile(full, file) {
  const reader = sessionReader(), input = createReadStream(full, {encoding: 'utf8'});
  let failed = null;
  input.on('error', (error) => { failed = error; });
  const lines = createInterface({input, crlfDelay: Infinity});
  try {
    for await (const line of lines) reader.add(line);
  } catch (error) { failed ??= error; } finally { lines.close(); input.destroy(); }
  if (failed) throw new Error(`session "${file}" could not be read: check it is a file you can read, then run again`);
  return reader.result();
}
