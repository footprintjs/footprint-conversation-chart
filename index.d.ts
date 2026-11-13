/**
 * footprint-conversation-chart: a conversation in, a checked storyboard out, by a footprintjs chart whose record says why
 * each choice was made. Hand-written types, structural; `unknown` where a value is untrusted or belongs to another package.
 */

/** What every stage that asks sends: instructions are code's words, material is data lines. Frozen. */
export interface StoryBrief {
  readonly stage: 'pick' | 'choose-shape' | 'write' | 'fix';
  readonly instructions: string;
  readonly material: string;
  readonly expects: 'points' | 'shape' | 'board' | 'piece';
  /** The message ids the material holds, in order. */
  readonly ids: readonly string[];
}

/** A model, as the chart asks it: the brief and `{stage}`, answered with JSON text (or a promise of it). */
export interface StoryDriver {
  answer(brief: StoryBrief, at: {readonly stage: string}): unknown;
}

/** One message of a conversation given in memory. The chart checks it; its words are untrusted. */
export interface ConversationMessage {
  id: string;
  who?: string;
  text: string;
}

/**
 * The conversation, one way: messages in memory, a JSON file holding that list, or a chatbot session file (one JSON record
 * per line). File paths are read inside `cwd` only.
 */
export type Conversation =
  | {messages: readonly unknown[]; file?: undefined; session?: undefined}
  | {file: string; messages?: undefined; session?: undefined}
  | {session: string; messages?: undefined; file?: undefined};

/** A problem the drawer cannot draw, at the board's place (`closing`, `checked[1]`, ...). */
export interface DrawerProblem {
  at: string;
  message: string;
}

/** The tool that draws the board: the shapes it draws, and its own reader when it has one. */
export interface StoryDrawer {
  /** Shape names from footprint-story's shapes, each once, at least one. */
  shapes: readonly string[];
  /** Given the read storyboard once it reads: what the tool cannot draw, or []. */
  problemsOf?(board: unknown): readonly DrawerProblem[] | Promise<readonly DrawerProblem[]>;
}

/** The options both doors share. */
export interface StoryOptions {
  conversation: Conversation;
  drawer: StoryDrawer;
  /** Ask for one shape; otherwise code chooses from what fits. */
  shape?: string;
  /** Bytes per pick brief: a whole number, 1024 at the least; 96 KB by default. */
  window?: number;
  /** Fix rounds, 0 to 10; 3 by default. */
  mostFix?: number;
  /** The folder a conversation file is read in; the process's own by default. */
  cwd?: string;
}

export interface StoryFromConversationOptions extends StoryOptions {
  model: StoryDriver;
}

export interface StorySessionOptions extends StoryOptions {
  /** How long the session waits on the host before it ends: 1 to 2^31 − 1 ms; 30 minutes by default. */
  idleMs?: number;
  model?: never;
}

export type Standing = 'known' | 'not-sure' | 'ask';

export interface SceneStanding {
  standing: Standing;
  why: string;
  /** The message ids the scene cites. */
  sources: (string | undefined)[];
  /** The index into the record's points, or null. */
  point: number | null;
}

/** What only the owner can answer: a scene, a point or a window, and why (fixed words). */
export type StoryAsk = {scene: string; why: string} | {point: number; why: string} | {window: number; why: string};

export interface StoryStopped {
  at: 'choose-shape' | 'write' | 'judge';
  why: string;
}

/** The run's record: its narrative and its snapshot (null, with `incomplete`, when it could not be copied). Words-free. */
export interface StoryRecord {
  narrative: unknown[];
  snapshot: unknown;
  incomplete?: string;
}

export interface StoryResult {
  /** The read storyboard (footprint-story's), or null when the run stopped. */
  readonly board: unknown;
  readonly shape: string | null;
  readonly standing: Readonly<Record<string, SceneStanding>>;
  readonly ask: readonly StoryAsk[];
  readonly stopped: StoryStopped | null;
  /** What was left, when the run stopped. */
  readonly problems: readonly DrawerProblem[];
  readonly record: StoryRecord;
}

/** One step of a session: a brief to answer, or the run's result. */
export type StoryStep = {brief: StoryBrief; result?: undefined} | {result: StoryResult; brief?: undefined};

export interface StorySession {
  /** Starts the run, or gives the waiting brief again, or (after the end) the result again. */
  next(): Promise<StoryStep>;
  /** Answers the waiting brief with JSON text; settles at the next brief or the end. */
  answer(text: string): Promise<StoryStep>;
  /** Ends the session; settles once the run has wound down. */
  cancel(): Promise<void>;
}

/** A refusal of the chart's own: fixed words; what caused it is `cause`, once the record is taken. */
export interface StoryRefusal extends Error {
  record?: StoryRecord;
  cause?: unknown;
}

/** Run the chart. Rejects with a StoryRefusal (its `record` kept) when a stage or the model fails. */
export function storyFromConversation(options: StoryFromConversationOptions): Promise<StoryResult>;

/** The same run, step by step, for a host whose model answers from outside it. Throws at once on bad options. */
export function storySession(options: StorySessionOptions): StorySession;

/** A driver from any function that answers a brief with JSON text. */
export function inProcess(fn: (brief: StoryBrief) => unknown): StoryDriver;

/** The chart, drawn as Mermaid text from the real chart. */
export function storyMermaid(): string;
