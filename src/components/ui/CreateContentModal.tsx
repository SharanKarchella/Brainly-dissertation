/**
 * CreateContentModal — add new content with auto-fill from URL.
 *
 * Task 4 change: the oEmbed fetch now also retrieves the author/channel name
 * and passes it through to the content object as metadata.author.
 * The auto-tagging hook uses this to enrich vague or short titles before
 * sending them to Claude — e.g. "Episode 12 | channel: 3Blue1Brown"
 * is far more informative than "Episode 12" alone.
 *
 * If oEmbed is unavailable (network error, unsupported URL), both title and
 * author fall back gracefully to null and the user types them manually.
 */
import { useState, useEffect } from "react";
import { Button } from "./Button";
import type { Content } from "../../types";

const contentTypes = {
  Youtube: "youtube",
  Twitter: "twitter",
} as const;
type ContentType = (typeof contentTypes)[keyof typeof contentTypes];

function detectType(url: string): ContentType | null {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("twitter.com") || url.includes("x.com"))    return "twitter";
  return null;
}

/** Fetches title AND author name from the oEmbed endpoint for the given URL */
async function fetchOEmbed(
  url: string,
  type: ContentType
): Promise<{ title: string | null; author: string | null }> {
  try {
    if (type === "youtube") {
      const res  = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      );
      const data = await res.json();
      return {
        title:  data.title       ?? null,
        author: data.author_name ?? null, // YouTube channel name
      };
    }
    if (type === "twitter") {
      const res  = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`
      );
      const data = await res.json();
      return {
        title:  data.author_name ? `Tweet by ${data.author_name}` : null,
        author: data.author_name ?? null, // Twitter/X username
      };
    }
  } catch {
    // oEmbed can fail (CORS, network, unsupported URL) — fall through silently
  }
  return { title: null, author: null };
}

export function CreateContentModal({
  open,
  onClose,
  onAdd,
}: {
  open:    boolean;
  onClose: () => void;
  onAdd:   (content: Content) => void;
}) {
  const [link,     setLink]     = useState("");
  const [title,    setTitle]    = useState("");
  const [author,   setAuthor]   = useState<string | null>(null);
  const [type,     setType]     = useState<ContentType>(contentTypes.Youtube);
  const [fetching, setFetching] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Auto-detect type and fetch oEmbed metadata after user stops typing
  useEffect(() => {
    if (!link) return;
    const timer = setTimeout(async () => {
      const detected = detectType(link);
      if (!detected) return;
      setType(detected);
      if (title) return; // don't overwrite if user already typed a title
      setFetching(true);
      const { title: fetched, author: fetchedAuthor } = await fetchOEmbed(link, detected);
      if (fetched) setTitle(fetched);
      setAuthor(fetchedAuthor); // store for metadata even if title was already set
      setFetching(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [link]);

  function handleClose() {
    setLink("");
    setTitle("");
    setAuthor(null);
    setType(contentTypes.Youtube);
    setError(null);
    onClose();
  }

  function addContent() {
    const t = title.trim();
    const l = link.trim();
    if (!l) {
      setError("Paste a link first.");
      return;
    }
    if (!t) {
      setError(
        fetching
          ? "Still fetching the title — give it a second, or type one."
          : "Add a title — auto-fetch couldn't find one for this link."
      );
      return;
    }

    const content: Content = {
      title: t,
      link:  l,
      type,
      // Include metadata only when we actually have it — keeps old items' shape
      ...(author || type
        ? {
            metadata: {
              ...(author   ? { author }                     : {}),
              provider: type === "youtube" ? "YouTube" : "Twitter",
            },
          }
        : {}),
    };

    onAdd(content);
    setLink("");
    setTitle("");
    setAuthor(null);
    setType(contentTypes.Youtube);
    setError(null);
    onClose();
  }

  return (
    <div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-800 opacity-60" onClick={handleClose} />
          <div className="relative bg-slate-700 p-6 rounded-md shadow-md border-2 border-slate-600 w-80">
            <div className="flex justify-end mb-2">
              <div
                onClick={handleClose}
                className="cursor-pointer text-slate-300 hover:text-white text-lg"
              >
                ✕
              </div>
            </div>

            <h2 className="text-lg font-bold text-slate-200 text-center underline mb-4">
              Add Content
            </h2>

            {/* Link first — drives auto-fill */}
            <div className="relative mb-2">
              <input
                value={link}
                onChange={(e) => { setLink(e.target.value); setError(null); }}
                placeholder="Paste YouTube or Twitter link"
                className="p-2 border border-slate-400 rounded-md w-full text-slate-100 bg-slate-800 pr-8"
              />
              {fetching && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs animate-pulse">
                  ⟳
                </span>
              )}
            </div>

            {/* Title — auto-filled or manually typed */}
            <div className="relative mb-4">
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(null); }}
                placeholder={fetching ? "Fetching title…" : "Title"}
                className="p-2 border border-slate-400 rounded-md w-full text-slate-100 bg-slate-800"
              />
            </div>

            <h1 className="text-lg font-bold text-slate-200 text-center mb-2">
              Type Of Content
            </h1>

            <div className="flex justify-center gap-2 mb-4">
              <Button
                text="Youtube"
                variant={type === contentTypes.Youtube ? "primary" : "secondary"}
                onClick={() => setType(contentTypes.Youtube)}
              />
              <Button
                text="Twitter"
                variant={type === contentTypes.Twitter ? "primary" : "secondary"}
                onClick={() => setType(contentTypes.Twitter)}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center mb-3">{error}</p>
            )}

            <div className="flex justify-center">
              <Button onClick={addContent} variant="primary" text="Submit" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
