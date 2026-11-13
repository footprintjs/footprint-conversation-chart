/**
 * How a stage asks: the brief goes to the run's driver, the answer is read by the stage's own check, and an answer it cannot
 * use is retried. On the last try the refusal is kept as an outcome instead ({refused: code}), so a run that cannot get a
 * usable answer says where and why, rather than failing with no board.
 */
import {attemptOf} from '../engine.mjs';
import {ASK_RETRY, askJson, isMalformed} from './port.mjs';

/**
 * The brief asked again after a refusal: the same brief, its instructions saying what was wrong. The words are the
 * refusal's own, code's fixed words (MalformedAnswer), never the answer's, so nothing the model wrote comes back to it as
 * an instruction. Without them a retry repeats the brief the model already got wrong, and it makes the same mistake.
 */
export const again = (b, refusal) => Object.freeze({...b, instructions: `${b.instructions}\nYour last answer was refused: ${refusal.message}. Answer again with that fixed.`});

/** One ask per stage attempt, retried by the stage's policy: {value}, or {refused: code} on its last attempt. */
export async function askOrRefuse(scope, run, b, read) {
  // The stage's retry runs it again from its top, so the refusal it must answer is kept in working memory (never state).
  const last = run.work.refusals?.[b.stage];
  if (run.work.refusals) delete run.work.refusals[b.stage];
  try {
    return {value: read(await askJson(run.model, last ? again(b, last) : b))};
  } catch (error) {
    const {attempt, of} = attemptOf(scope);
    if (isMalformed(error) && attempt >= of) return {refused: error.code};
    if (isMalformed(error)) (run.work.refusals ??= {})[b.stage] = error;
    throw error;
  }
}

/**
 * One ask with its own tries, for a stage that asks several times (the fix, once per piece): each ask gets the policy's
 * tries whatever the asks before it used. {value, tries} or {refused: code, tries}. A model that fails is never retried.
 */
export async function askWithTries(run, b, read, tries = ASK_RETRY.attempts) {
  let asked = b;
  for (let n = 1; ; n++) {
    try {
      return {value: read(await askJson(run.model, asked)), tries: n};
    } catch (error) {
      if (!isMalformed(error)) throw error;
      if (n >= tries) return {refused: error.code, tries: n};
      asked = again(b, error);
    }
  }
}
