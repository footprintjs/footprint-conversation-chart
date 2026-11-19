# Changelog

## 0.1.0

First release: the conversation-to-storyboard chart, moved out of StoryReel so StoryDeck and StoryReel share it.

- Needs `footprintjs` ^14 as a peer (which needs `foottrace` ^2.1 beside it), and comes with `footprint-story` ^0.9: its
  brief now tells the model how many entries each list holds, so a first answer is refused less often.

- `storyFromConversation({conversation, model, drawer, shape?, window?, mostFix?, cwd?})`, `inProcess(fn)` and
  `storyMermaid()`, as the chart had them, with one port changed: the tool that draws the board is now
  `drawer: {shapes, problemsOf?}` (replacing `drawable` and the built-in film reader). `drawer` is required.
- `storySession(options)`: the same run answered step by step from outside it (`next()`, `answer(text)`, `cancel()`),
  for a host whose model is the calling assistant. One brief outstanding at a time; idle sessions end after `idleMs`
  (30 minutes by default).
- `conversation: {session: path}`: a chatbot session file (one JSON record per line), read a line at a time inside
  `cwd` with footprint-story 0.8.0's `sessionReader`. A session still being written (the host's own) is read once, as it
  stands; a line too long is dropped as it streams past, never held.
- An empty conversation is refused up front, naming the fix (it used to fail inside the pick stage).
