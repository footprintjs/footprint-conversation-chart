# read-source/ — the conversation, opened

**Why:** every later stage needs the conversation's words for a brief, and none of them may keep the words. So this
opens it as a source: facts for the record, words read again from where they came from whenever a brief needs them.

`openSource(conversation, {cwd, window})` (async) → `{facts, window(i), cited(ids), all(), ordinalOf(id), idOf(k)}`;
`window`, `cited` and `all` are async, as a changed file is read again. The conversation is `{messages}`, `{file}` (a JSON
list) or `{session}` (a chatbot session file, one JSON record per line, read a line at a time with `node:readline` and the
session reader; `session-reader.mjs` is the one door to it, a vendored copy until footprint-story 0.8.0 ships it). `facts`: message count, bytes, sha256,
the window size, how many messages were clipped, and the windows as message offsets `{from, to, bytes}`.

**Threats**
- A path out of the project, a link, a folder, a file too big: `files.mjs` reads only an in-project real path, a regular
  file, at most 32 MB for a JSON list and 256 MB for a session. Tested for both kinds (`test/session-file.test.mjs`).
- A session's odd lines, tool calls and host notes: the reader skips and counts them; state gets one total, `skipped`,
  never the kinds (a kind is named by the file).
- An empty conversation, or a session with nothing a person or the assistant said: refused, naming the fix.
- Malformed messages, too many: checked by the storyboard door's own rule (`storyboardBrief`), 5,000 messages at the most.
- Ids in the record: state names a message by its ordinal; ids map back from working memory only. An id over 80
  characters (the longest a board may cite) is refused, and that is asked before anything that would quote it.
- A refusal quoting the input: a file that is not JSON is refused without the parser's message (`files.mjs` never
  uses it); the storyboard door's own refusal (it quotes an id) is kept aside as the cause. Tested.
- Words in the record: only the facts are written to state. Tested in `test/read-source.test.mjs` and `test/threats.test.mjs`.
- A file or a list changed between stages: messages given in memory are copied at the start; a file is read again only
  when its stat changes (device, inode, size, change and modify times), and refused unless its words hash the same. So
  each window costs its own bytes, not the whole conversation again.
- Too many windows (each one a pass of the loop): at most `MOST_WINDOWS` (200); the refusal names the window that fits.
- One huge message: clipped to fit its window, saying how much was cut; the check still reads it whole.
