import { useState, useEffect } from "react";
import { loadTagMap, saveTagMap } from "../utils/tagStore";

interface Content {
  title: string;
  link: string;
  type: string;
}

export function useContentTags(contents: Content[]) {
  const [tagMap, setTagMap] = useState<Record<string, string[]>>(loadTagMap);

  useEffect(() => {
    if (contents.length === 0) return;

    const current = loadTagMap();
    const untagged = contents.filter((c) => !current[c.link]);

    if (untagged.length === 0) {
      setTagMap(current);
      return;
    }

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn("[AutoTag] VITE_ANTHROPIC_API_KEY not found — restart dev server after adding .env");
      return;
    }
    console.log("[AutoTag] Generating tags for:", untagged.map(c => c.title));

    const list = untagged
      .map((c, i) => `${i}. [${c.type.toUpperCase()}] "${c.title}"`)
      .join("\n");

    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `For each content item, assign 2-3 topic tags. Only use tags from: programming, design, finance, music, sports, news, humor, science, health, business, education, entertainment, technology, politics, art, cooking, travel, gaming.\n\nReturn ONLY a raw JSON object where keys are 0-based indices and values are tag arrays. Example: {"0":["programming","education"],"1":["finance"]}\n\nItems:\n${list}`,
          },
        ],
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        const text: string = data.content?.[0]?.text ?? "{}";
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return;
        const indexMap: Record<string, string[]> = JSON.parse(match[0]);
        const newEntries: Record<string, string[]> = {};
        Object.entries(indexMap).forEach(([idx, tags]) => {
          const item = untagged[Number(idx)];
          if (item) newEntries[item.link] = tags as string[];
        });
        const updated = { ...current, ...newEntries };
        console.log("[AutoTag] Tags generated:", newEntries);
        saveTagMap(updated);
        setTagMap(updated);
      })
      .catch((err) => console.error("[AutoTag] Failed:", err));
  }, [contents]);

  const allTags = [...new Set(contents.flatMap((c) => tagMap[c.link] ?? []))].sort();

  return { tagMap, allTags };
}
