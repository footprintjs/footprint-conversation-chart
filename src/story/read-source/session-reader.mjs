/**
 * The one door to the chatbot-session reader. footprint-story 0.8.0 ships it as `sessionReader` from
 * `footprint-story/storyboard`; until then it is a vendored copy. When 0.8.0 is out, this line becomes
 *   export {sessionReader} from 'footprint-story/storyboard';   (with MOST_LINE: 2 ** 21 kept here)
 * the vendored file is deleted, and the dependency moves to ^0.8.0. Nothing else imports the reader.
 */
export {MOST_LINE, sessionReader} from '../../vendor/session.js';
