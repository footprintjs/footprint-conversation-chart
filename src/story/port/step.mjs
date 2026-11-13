/**
 * A driver for a host whose model answers from outside the run: an MCP tool, where the calling assistant is the model. The
 * chart keeps running in this process; when a stage asks, the driver's `answer(brief)` returns a promise, and the host's
 * next `answer(text)` call resolves it. No footprintjs pause is needed: the run simply waits on that promise.
 *
 *   next()        → Promise<{brief} | {result}>   starts the run, or gives the brief that is waiting again
 *   answer(text)  → Promise<{brief} | {result}>   answers the waiting brief; settles at the next brief or the end
 *   cancel()      → Promise<void>                 ends the session; settles once the run has wound down
 *
 * Bounded: one brief outstanding at a time; an answer with no brief waiting is refused; one host call waits at a time; a
 * session that waits on the host longer than `idleMs` (30 minutes by default) ends with a refusal. Every refusal is fixed
 * words, and the run's own refusal (with its `cause` and `record`) is what a call rejects with when the run fails.
 */
import {StoryRefusal} from '../refusal.mjs';

/** How long a session waits for the host by default: 30 minutes. */
export const IDLE_MS = 30 * 60 * 1000;
/** The longest wait a host timer holds (2^31 − 1 ms, about 24.8 days). */
export const MOST_IDLE_MS = 2 ** 31 - 1;

/** The session ended (idle, or cancelled): a later call gets the same refusal. */
export class SessionEnded extends StoryRefusal {
  constructor(message) { super(message); this.name = 'SessionEnded'; }
}

/** A call the session cannot take now (no brief waiting, or a call already waiting): the session goes on. */
export class SessionMisuse extends StoryRefusal {
  constructor(message) { super(message); this.name = 'SessionMisuse'; }
}

const NO_BRIEF = 'no brief is waiting for an answer: call next() for the brief, then answer it once';
const BUSY = 'a call is already waiting for the session\'s next step: await it before calling again';
const DONE = 'the session has ended and its result was given: start a new session to run again';
const IDLE = (ms) => `the session waited ${ms} ms for the host and ended: start a new session`;
const CANCELLED = 'the session was cancelled: start a new session to run again';

/**
 * The session over a run: `start(driver)` runs the chart with this driver as its model and returns the run's promise.
 * Started on the first next().
 */
export function stepSession(start, {idleMs = IDLE_MS} = {}) {
  if (!Number.isInteger(idleMs) || idleMs < 1 || idleMs > MOST_IDLE_MS) throw new RangeError(`idleMs is a whole number of milliseconds from 1 to ${MOST_IDLE_MS}: give one, or leave it out for ${IDLE_MS} (30 minutes)`);
  let started = false, settled = Promise.resolve();
  let asking = null;    // the brief the run waits on: {brief, resolve, reject}
  let waiter = null;    // the host call waiting for the next step: {resolve, reject}
  let outcome = null;   // how the session ended: {value: {result}} | {error}
  let timer = null;

  const clear = () => { if (timer) clearTimeout(timer); timer = null; };
  const arm = () => { clear(); timer = setTimeout(() => end({error: new SessionEnded(IDLE(idleMs))}), idleMs); timer.unref?.(); };
  const wait = () => new Promise((resolve, reject) => { waiter = {resolve, reject}; });
  const give = (step) => { const w = waiter; waiter = null; w?.resolve(step); };
  const told = () => (outcome.error ? Promise.reject(outcome.error) : Promise.resolve(outcome.value));

  /** The session's end, once: the brief the run waits on is refused (so the run winds down), the waiting call told. */
  function end(how) {
    if (outcome) return;
    outcome = how;
    clear();
    const a = asking, w = waiter;
    asking = null; waiter = null;
    a?.reject(how.error ?? new SessionEnded(DONE));
    if (w) { if (how.error) w.reject(how.error); else w.resolve(how.value); }
  }

  const driver = Object.freeze({kind: 'step', answer: (brief) => new Promise((resolve, reject) => {
    if (outcome) { reject(outcome.error ?? new SessionEnded(DONE)); return; }
    asking = {brief, resolve, reject};
    arm();
    give({brief});
  })});

  function next() {
    if (outcome) return told();
    if (waiter) return Promise.reject(new SessionMisuse(BUSY));
    if (asking) return Promise.resolve({brief: asking.brief});
    if (started) return Promise.reject(new SessionMisuse(BUSY));
    started = true;
    clear();
    const step = wait();
    settled = Promise.resolve().then(() => start(driver)).then((result) => end({value: {result}}), (error) => end({error}));
    return step;
  }

  function answer(text) {
    if (outcome) return outcome.error ? Promise.reject(outcome.error) : Promise.reject(new SessionMisuse(DONE));
    if (waiter) return Promise.reject(new SessionMisuse(BUSY));
    if (!asking) return Promise.reject(new SessionMisuse(NO_BRIEF));
    const a = asking;
    asking = null;
    clear();
    const step = wait();
    a.resolve(text);
    return step;
  }

  function cancel() {
    end({error: new SessionEnded(CANCELLED)});
    return settled.then(() => undefined);
  }

  arm();   // a session never started still ends when idle
  return Object.freeze({next, answer, cancel});
}
