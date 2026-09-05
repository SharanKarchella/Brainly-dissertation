/**
 * React hook that auto-tags newly added content items.
 *
 * Behaviour:
 *   - On every render where contents changes, checks which items lack tags.
 *   - Sends only the un-tagged items to Claude in a single batch call.
 *   - Tags are persisted to localStorage so they survive page reloads and are
 *     not regenerated on subsequent renders.
 *   - No-ops gracefully when the API key is absent.
 *
 * Task 4 enrichment:
 *   If a content item carries metadata.author (the YouTube channel name or
 *   Twitter username fetched at add-time), that string is forwarded to the
 *   tagging API as extra context.  This significantly improves tag quality
 *   for short or vague titles (e.g. "Episode 12 | channel: 3Blue1Brown"
 *   is much clearer than "Episode 12" alone).
 */
import { useState, useEffect } from "react";
import { loadTagMap, saveTagMap } from "../utils/tagStore";
import { callTaggingAPI, type TaggingItem } from "../ai/prompts";
import type { Content } from "../types";

export function useContentTags(contents: Content[]) {
  const [tagMap, setTagMap] = useState<Record<string, string[]>>(loadTagMap);

  useEffect(() => {
    if (contents.length === 0) return;

    const current = loadTagMap();
    const untagged = contents.filter((c) => !current[c.link]);

    if (untagged.length === 0) {
      // All items already have tags — just sync state with storage
      setTagMap(current);
      return;
    }

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn(
        "[AutoTag] VITE_ANTHROPIC_API_KEY not set — " +
        "restart the dev server after adding it to .env"
      );
      return;
    }

    // Build the items array, attaching author metadata where available.
    // The index field must match position in the untagged array so the API
    // response can be mapped back to the right content item.
    const items: TaggingItem[] = untagged.map((c, i) => ({
      index: i,
      type: c.type,
      title: c.title,
      author: c.metadata?.author, // undefined is fine — the API handles it
    }));

    console.log("[AutoTag] Generating tags for:", untagged.map((c) => c.title));

    callTaggingAPI(items, apiKey)
      .then(({ tagsByIndex }) => {
        const newEntries: Record<string, string[]> = {};
        for (const [idx, tags] of Object.entries(tagsByIndex)) {
          const item = untagged[Number(idx)];
          if (item) newEntries[item.link] = tags;
        }
        const updated = { ...current, ...newEntries };
        console.log("[AutoTag] Tags generated:", newEntries);
        saveTagMap(updated);
        setTagMap(updated);
      })
      .catch((err) => console.error("[AutoTag] Failed:", err));
  }, [contents]);

  // Derive a sorted list of all distinct tags across the current content set
  const allTags = [...new Set(contents.flatMap((c) => tagMap[c.link] ?? []))].sort();

  return { tagMap, allTags };
}
