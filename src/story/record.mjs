/** Two small helpers for the chart's record, as the tools that share this chart keep theirs. */

/**
 * The chart's logger: a refusal is rethrown to the caller (and kept in the record's narrative), so footprintjs does not print
 * it a second time; its warnings still reach the console.
 */
export const QUIET = Object.freeze({info() {}, log() {}, debug() {}, error() {}, warn: (...args) => console.warn(...args)});

/** A chart's narrative without its live raw values, so the record survives structuredClone. */
export const plainNarrative = (trace) => trace.getEntries().map(({rawValue, ...entry}) => entry);
