# port/ — the model, as a port

**Why:** the chart holds no model. Every stage that asks sends one brief shape and takes JSON text back, so any model,
in process or answered from outside the run, plugs in without changing the chart.

`brief(stage, instructions, material, ids)` → `{stage, instructions, material, expects, ids}`; `inProcess(fn)` → a driver;
`askJson` hands the driver the brief and `{stage}` and reads its answer; `askOrRefuse` (ask.mjs) asks once per stage
attempt, retried by the stage's policy, and keeps a last refusal as an outcome; `askWithTries` gives each of several asks
in one stage (the fix's pieces) the policy's tries of its own. `ASK_RETRY` is the policy.

**Answered from outside, without a pause.** `step.mjs · stepSession` (behind `storySession`) is a driver whose
`answer(brief)` returns a promise: the brief goes to the host's waiting `next()` or `answer()` call, and the host's next
`answer(text)` resolves it. The chart keeps running in the same process, so no footprintjs pause, no checkpoint, and no
scope reaches the driver.

**Threats**
- An answer's words in the record: refusals are code's own words by code; a JSON parser's message (which quotes the text)
  is never used. Tested.
- A model's own error (which may quote the brief): kept off the record (`refusal.mjs` keeps it under a private symbol),
  handed to the caller as the refusal's `cause`. A model that failed is never retried.
- The chart's scope reaching a driver: a driver gets `{stage}`, frozen. Tested.
- A huge answer: over 1 MB is refused.
- A host that misuses a session: one brief outstanding at a time, an answer with no brief waiting refused, one host call
  waiting at a time; an idle session ends after `idleMs` (30 minutes by default) and `cancel()` ends it at once, the
  waiting brief refused so the run winds down. Tested (`test/session.test.mjs`).
