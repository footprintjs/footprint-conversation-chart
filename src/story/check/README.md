# check/ — the existing readers, and the judge

**Why:** the board is checked by the readers that already exist, unchanged: `storyboardProblems` against the whole
conversation, then, once it reads, the drawer's own reader (`drawer.problemsOf`): a film's, a deck's, whatever tool draws
it. Problems are grouped into pieces by `storyboardFixBriefs`. The judge's `decide()` chooses done, fix or stop, with the
reason on the record.

`checkBoard(board, conversation, drawer)` (async) → `{problems, fixBriefs, facts}`; `JUDGE_RULES` are data.
`drawer.mjs` is the drawer port: `drawerOf(drawer)` checks and copies `{shapes, problemsOf?}` at the start, each refusal
naming the fix; `drawerProblems(drawer, board)` asks the reader and refuses an answer that is not `[{at, message}]`.

**Threats**
- A number in an unshown message: the check reads the whole conversation (`checkAnywhere`), so it is still checked.
- A disguised number, braces, a script: refused by the readers as today.
- A key the board wrote reaching the record: state holds piece names code wrote (`frame`, `checked[1]`) and counts.
- A drawer's answer of the wrong shape: refused in fixed words; its problems stay in working memory, never in state.
