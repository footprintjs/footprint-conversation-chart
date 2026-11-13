/**
 * A conversation's file, read only inside the project: by its real path (so a link cannot lead out), a regular file, under
 * the size its kind may be. Refusals name the file as the caller gave it and the fix, and never quote what the file holds:
 * a JSON parser's own message quotes the text it read, so it is never used. A session file (one JSON record per line) is
 * read a line at a time and handed to the session reader, never held as one string; a line longer than the reader reads is
 * skipped as it streams past, so it is never held either.
 */
import {createReadStream, existsSync, readFileSync, realpathSync, statSync} from 'node:fs';
import path from 'node:path';
import {MOST_LINE, sessionReader} from './session-reader.mjs';

/**
 * The most bytes each kind of file may be. A JSON list is read whole. A session is streamed and only what was said is kept
 * (at most 5000 messages), so its bound is on the time a read takes, not memory: 8 GB, several times a long working
 * session (one of 795 MB reads in a few seconds).
 */
export const MOST_FILE_BYTES = Object.freeze({conversation: 32 << 20, session: 8 * 2 ** 30});

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

/**
 * The lines of a stream of text, one at a time, without ever holding more than one line of at most `most` characters: a
 * longer line is dropped as it streams past and reported as `null`, so the caller can count it. `\r\n` ends a line too.
 */
export async function* boundedLines(chunks, most) {
  let line = '', dropping = false;
  for await (const chunk of chunks) {
    let at = 0;
    for (;;) {
      const end = chunk.indexOf('\n', at);
      const piece = chunk.slice(at, end < 0 ? chunk.length : end);
      if (!dropping) {
        if (line.length + piece.length > most) { dropping = true; line = ''; } else line += piece;
      }
      if (end < 0) break;
      if (dropping) yield null; else yield line.endsWith('\r') ? line.slice(0, -1) : line;
      line = ''; dropping = false; at = end + 1;
    }
  }
  if (dropping) yield null; else if (line) yield line.endsWith('\r') ? line.slice(0, -1) : line;
}

/** A session file checked by checkFile, a line at a time: {messages, left}, as the session reader gives them. */
export async function readSessionFile(full, file) {
  const reader = sessionReader(), input = createReadStream(full, {encoding: 'utf8'});
  let tooLong = 0;
  try {
    for await (const line of boundedLines(input, MOST_LINE)) {
      if (line === null) tooLong++; else reader.add(line);
    }
  } catch { throw new Error(`session "${file}" could not be read: check it is a file you can read, then run again`); } finally { input.destroy(); }
  const read = reader.result();
  if (!tooLong) return read;
  return Object.freeze({messages: read.messages, left: Object.freeze({...read.left, 'line-too-long': (read.left['line-too-long'] ?? 0) + tooLong})});
}
