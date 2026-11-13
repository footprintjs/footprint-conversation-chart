/**
 * The conversation, as a source the chart can re-read: its facts (counts, bytes, a hash, window offsets) for the record, and
 * its words for a brief only. The words never go into the chart's state: a run record, a checkpoint or a sink then carries
 * no planted instruction and no private words. Messages are named in state by their ordinal (their place in the
 * conversation), never by their id, which is text the conversation chose.
 *
 * Read once: messages given in memory are copied, so a change to the caller's list cannot reach the run; a file (a JSON list,
 * or a chatbot session read a line at a time) is read again only when its stat changes (inode, size, change and modify
 * times), and then refused unless its words hash the same. Reading a file may wait, so the source's reads are async.
 */
import {createHash} from 'node:crypto';
import {statSync} from 'node:fs';
import path from 'node:path';
import {dataLine, storyboardBrief} from 'footprint-story/storyboard';
import {checkFile, readJsonFile, readSessionFile} from './files.mjs';
import {StoryRefusal} from '../refusal.mjs';

/** The most characters a message id may have: the most a storyboard's source may be, so a longer one could never be cited. */
export const MOST_ID = 80;
/** One window by default, in bytes: about 24k tokens at four bytes each. */
export const WINDOW_BYTES = 96 * 1024;
/** The smallest window that may be asked for: a message line clipped to fit must still say something. */
export const LEAST_WINDOW_BYTES = 1024;
/** The most windows one run picks from: each is a pass of the chart's loop, and its record grows with them. */
// Each window is one pass of the chart's loop, and footprintjs's execution tree nests one level deeper per pass; copying
// that tree for the record runs out of stack near 500 passes on a CI runner. 200 still completes at 40% of Node's default stack.
export const MOST_WINDOWS = 200;

const lineOf = ({id, who, text}) => dataLine({id, ...(who === undefined ? {} : {who}), text});
const bytesOf = (text) => Buffer.byteLength(text);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const refuse = (message, original) => { throw new StoryRefusal(message, original); };

/** The file's stat as one comparable stamp. */
function stampOf(full) {
  const s = statSync(full, {bigint: true});
  return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
}

const ONE_WAY = 'give the conversation one way: {file: "chat.json"} (a JSON list), {session: "session.jsonl"} (a chatbot session file) or {messages: [{id, text}]}';

/**
 * {messages, stamp?, full?, skipped?} as given: the list itself, the JSON file in the project that holds it, or the session
 * file in the project it is read from (`skipped`: how many of its records the reader left out). Refuses in fixed words.
 */
async function loadMessages(conversation, cwd) {
  if (conversation === null || typeof conversation !== 'object') refuse(ONE_WAY);
  const {file, messages, session} = conversation;
  if ([file, messages, session].filter(Boolean).length !== 1) refuse(`${ONE_WAY}, not two of them or none`);
  if (messages) return {messages};
  const what = file ? 'conversation' : 'session', name = file ?? session;
  if (typeof name !== 'string') refuse(file ? 'give the conversation file as a path: {file: "chat.json"}' : 'give the session file as a path: {session: "session.jsonl"}');
  try {
    const full = checkFile(name, what, cwd);   // where it is, what it is: refused first, nothing read
    // A session is read once, as it stands: it is often still being written (the host's own session grows while the run
    // asks it), so the words read are the run's copy and later writes are not part of it. A JSON list is checked for change.
    if (session) {
      const read = await readSessionFile(full, name);
      if (!read.messages.length) refuse(`the session file "${name}" holds no message a person or the assistant wrote: name a session with a conversation in it`);
      return {messages: [...read.messages], skipped: Object.values(read.left).reduce((n, count) => n + count, 0)};
    }
    const before = stampOf(full);
    const read = {messages: readJsonFile(full, name)};
    if (stampOf(full) !== before) refuse(`the ${what} file changed while it was read: run again once nothing writes to it`);
    return {messages: read.messages, stamp: before, full};
  } catch (error) {
    if (error instanceof StoryRefusal) throw error;
    // the file helpers' refusals name the file and the fix in their own words, and never quote the file
    return refuse(String(error?.message ?? error));
  }
}

/**
 * Messages checked: a list, every id short enough to cite (asked first, so no refusal below can quote a long one), then the
 * storyboard door's own rule (what storyboardBrief accepts). The door's refusal quotes a message's id, so it is kept aside.
 */
function checked(messages) {
  if (!Array.isArray(messages)) refuse('a conversation is a list of messages: give [{id, who?, text}]');
  if (!messages.length) refuse('the conversation has no messages: give at least one {id, who?, text}');
  const long = messages.findIndex((m) => typeof m?.id === 'string' && m.id.length > MOST_ID);
  if (long >= 0) refuse(`message ${long}: its id has ${messages[long].id.length} characters, and ${MOST_ID} is the most a storyboard can cite: give it a shorter id`);
  try { storyboardBrief('what-we-found', {conversation: messages}); } catch (error) {
    refuse('the conversation has a message the storyboard door cannot use, or more messages than it reads: give each one {id, who?, text}, ids unique, at most 5000 (read this refusal\'s cause for which)', error);
  }
  return messages;
}

/**
 * Windows over the lines: [{from, to, bytes}], `to` past the last, in order, every line in exactly one. A line counts its
 * bytes and its line end. A line longer than a window is a window of its own, clipped when it is sent (clipMessage).
 */
export function windowsOf(lineBytes, most) {
  const windows = [];
  lineBytes.forEach((size, i) => {
    const last = windows.at(-1), cost = size + 1;
    if (last && last.bytes + cost <= most) { last.to = i + 1; last.bytes += cost; return; }
    windows.push({from: i, to: i + 1, bytes: Math.min(cost, most)});
  });
  return windows;
}

/** The smallest window, in whole kilobytes, that covers the lines in at most MOST_WINDOWS windows. */
function leastWindowFor(lineBytes) {
  let low = LEAST_WINDOW_BYTES, high = Math.max(LEAST_WINDOW_BYTES, lineBytes.reduce((n, b) => n + b + 1, 0));
  while (high - low > 1024) { const mid = Math.ceil((low + high) / 2048) * 1024; if (windowsOf(lineBytes, mid).length <= MOST_WINDOWS) high = mid; else low = mid; }
  return Math.ceil(high / 1024) * 1024;
}

const CUT = (n) => `… (${n} more characters)`;
/** A message cut so its line fits in `most` bytes, saying how much it lost; as it was when it fits. */
export function clipMessage(message, most) {
  if (bytesOf(lineOf(message)) + 1 <= most) return message;
  let keep = Math.max(0, message.text.length - (bytesOf(lineOf(message)) + 1 - most) - 32);
  for (;;) {
    if (/[\uD800-\uDBFF]/.test(message.text[keep - 1] ?? '')) keep--;   // never half of a pair
    const cut = {...message, text: message.text.slice(0, keep) + CUT(message.text.length - keep)};
    if (bytesOf(lineOf(cut)) + 1 <= most || keep === 0) return cut;
    keep = Math.max(0, keep - Math.max(16, Math.ceil((bytesOf(lineOf(cut)) + 1 - most) / 2)));
  }
}

/**
 * The source: {facts, window(i), cited(ids), all(), ordinalOf(id), idOf(k)}. `facts` is all the record ever holds of it.
 * Every read of a JSON file checks its words are still the ones counted: a file changed during the run is refused, not read.
 * A session is the run's copy from its one read, so a session still being written goes on.
 * `window`, `cited` and `all` are async (a changed file is read again); `ordinalOf` and `idOf` read working memory only.
 */
export async function openSource(conversation, {cwd = process.cwd(), window = WINDOW_BYTES} = {}) {
  if (!Number.isInteger(window) || window < LEAST_WINDOW_BYTES) refuse(`a window is a whole number of bytes, ${LEAST_WINDOW_BYTES} at the least: give window as one, or leave it out for ${WINDOW_BYTES}`);
  const loaded = await loadMessages(conversation, cwd);
  let messages = checked(loaded.messages);
  if (!loaded.full) messages = structuredClone(messages);   // the run's own copy: the caller's list may change, the run's does not
  const lines = messages.map(lineOf), lineBytes = lines.map(bytesOf), material = lines.join('\n');
  const windows = windowsOf(lineBytes, window);
  if (windows.length > MOST_WINDOWS) refuse(`the conversation needs ${windows.length} windows of ${window} bytes, and ${MOST_WINDOWS} is the most one run picks from: give a larger window, ${leastWindowFor(lineBytes)} bytes at the least`);
  const facts = Object.freeze({
    messages: messages.length, bytes: bytesOf(material), sha256: sha256(material), window,
    clipped: lineBytes.filter((size) => size + 1 > window).length,
    windows: Object.freeze(windows.map((w) => Object.freeze(w))),
    ...(loaded.skipped === undefined ? {} : {skipped: loaded.skipped}),
  });
  const ordinals = new Map(messages.map((m, k) => [m.id, k]));
  let stamp = loaded.stamp;
  const current = async () => {
    if (!loaded.full || stampOf(loaded.full) === stamp) return messages;
    const again = await loadMessages(conversation, cwd);
    if (!Array.isArray(again.messages) || sha256(again.messages.map(lineOf).join('\n')) !== facts.sha256) refuse('the conversation changed during the run: its words no longer match what was counted at the start, so run again');
    stamp = again.stamp;
    return messages;
  };
  return Object.freeze({
    facts,
    /** The messages of window `i`, each clipped to fit it. */
    window: async (i) => (await current()).slice(windows[i].from, windows[i].to).map((m) => clipMessage(m, window)),
    /** The messages with these ids, in the conversation's order. */
    cited: async (ids) => {
      const all = await current();
      return [...new Set(ids)].filter((id) => ordinals.has(id)).map((id) => ordinals.get(id)).sort((a, b) => a - b).map((k) => all[k]);
    },
    /** Every message, as the checks read them: whole. */
    all: current,
    /** A message's ordinal, by id: what state names it by. Undefined for an id the conversation does not have. */
    ordinalOf: (id) => ordinals.get(id),
    /** A message's id, by ordinal: for the caller, from working memory only. */
    idOf: (k) => messages[k]?.id,
  });
}
