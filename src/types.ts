/**
 * Shared domain types used across the whole app.
 * Keep this file free of React and AI imports.
 */

/** Extra context fetched from oEmbed APIs when a link is first added */
export interface ContentMetadata {
  /** YouTube channel name or Twitter/X author username */
  author?: string;
  /** "YouTube" or "Twitter" */
  provider?: string;
}

/** A single piece of saved content — the core persisted entity */
export interface Content {
  type: string;
  title: string;
  link: string;
  /**
   * Optional metadata fetched at add-time.
   * Absent on items saved before this field was introduced;
   * always handled gracefully elsewhere.
   */
  metadata?: ContentMetadata;
}

/**
 * A Content item annotated with semantic-search scoring.
 *
 * The underscore-prefixed fields are runtime-only — they come back from
 * Claude's ranked search and are stored in React state but never written
 * to localStorage.
 */
export interface RankedContent extends Content {
  /** 0–1 relevance score assigned by Claude (absent for keyword results) */
  _score?: number;
  /** One-sentence reason why Claude matched this item (absent for keyword results) */
  _reason?: string;
  /** Which search path produced this result */
  _searchMode?: "ai" | "keyword";
}
