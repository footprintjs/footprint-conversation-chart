/**
 * The one door to the chatbot-session reader: footprint-story's `sessionReader`, from `footprint-story/storyboard` (0.8.0).
 * `MOST_LINE` is the longest line that reader reads (2 MB of UTF-16, its own MOST_LINE, which its door does not export):
 * the file reader drops a longer line as it streams past, so it is never held. test/session-reader.test.mjs pins that the two agree.
 */
export {sessionReader} from 'footprint-story/storyboard';
export const MOST_LINE = 2 ** 21;
