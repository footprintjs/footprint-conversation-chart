# story/ — a conversation to a checked storyboard, as a chart

**Why:** a long conversation does not fit in one brief, and a board with one wrong number should not be written again
whole. This chart reads the conversation once, window by window, writes the board from the points it picked and the
messages they cite, and sends back one piece at a time until the board reads. Its record says why each choice was made.

The facade is `src/index.mjs` (`storyFromConversation`, `storySession`, `inProcess`, `storyMermaid`); the package
README shows it in use, and draws the chart from `toMermaid()` (pinned by `test/readme.test.mjs`).

## The chart

The wiring, stage by stage:

| folder | stage | asks the model |
|---|---|---|
| `read-source/` | the conversation opened: counts, bytes, a hash, windows | no |
| `route/` | one brief or windowed, by `decide()` on the window count | no |
| `pick/` | points per window, looped with `loopTo`; the decider `next window` | yes, retried as a policy |
| `merge/` | one list; a disagreement marked `ask` | no |
| `choose-shape/` | `decide()` on the shapes the drawer draws that the points fill | only when two or more fit |
| `write/` | the board from the points and cited messages | yes, retried as a policy |
| `check/` | the storyboard's reader, then the drawer's (`drawer.mjs`, the drawer port), then the judge's `decide()`: done, fix, stop | no |
| `fix/` | one brief per piece at fault, then back to check; at most `mostFix` rounds | yes, retried as a policy |
| `done/` | the board read, a standing per scene, the asks | no |

`chart.mjs` is the wiring, as data. `engine.mjs` is the one module that calls footprintjs. `record.mjs` holds the\nrecord's two small helpers. `port/` is the model's port. `check/drawer.mjs` is the drawer's.

## The port

Every stage that asks sends the same shape, `{stage, instructions, material, expects, ids}`, and takes JSON text back.
`instructions` are code's words, the same whatever the conversation says; `material` is data lines. A driver is
`{answer(brief, at)}`, where `at` is `{stage}` and nothing more: a driver never holds the chart's scope. `inProcess(fn)`
awaits the app's own call. `port/step.mjs` is the step-by-step driver behind `storySession`: its `answer(brief)` returns a
promise the host resolves with its next `answer(text)` call, while the chart keeps running in the same process, so the port
did not change and no footprintjs pause is needed.

## What it does not do yet

- **Disagreements across windows are not found.** Each message is in one window and a point cites only its own window,
  so the merge removes duplicates and marks disagreements within a window only. Two windows that disagree keep both points,
  each standing on its own messages.
- **At most 200 windows a run** (`MOST_WINDOWS`): a longer conversation is refused, naming the larger window that fits it.

## Threats

A conversation is untrusted, and so is what a model writes. Words stay data; the chart's state, and so its record, holds
counts, bytes, a hash, window offsets and message ordinals (a message's place in the conversation), never words and never
a message's id (an id is text the conversation chose; the caller gets ids back on the result, from working memory). Every
refusal is fixed words: at the stage boundary (`engine.mjs`), anything that is not one of the chart's own refusals becomes
"the <stage> stage failed", its own error kept aside and handed to the caller as `cause` once the record is taken. Each
folder's README names its own threats. `test/threats.test.mjs` checks the main ones: no message or answer words, and
no message ids, in the record; nothing quoted on the error path (a file that is not JSON, a huge id on a bad message, a
stage's own failure); a planted instruction changes no instructions; every brief bounded; the record bounded at 200 windows.

Tests: one file per stage folder in `test/` (`read-source.test.mjs`, `pick.test.mjs`, …), with a scripted fake model and
a fake film drawer (`fakes.test.mjs`); `session-file.test.mjs` and `session.test.mjs` cover the session file and the
step-by-step driver.
