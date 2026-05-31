import { useState, useEffect } from "react";
import { Button } from "./Button";

const contentTypes = {
  Youtube: "youtube",
  Twitter: "twitter",
} as const;
type ContentType = (typeof contentTypes)[keyof typeof contentTypes];

function detectType(url: string): ContentType | null {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  return null;
}

async function fetchTitle(url: string, type: ContentType): Promise<string | null> {
  try {
    if (type === "youtube") {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      );
      const data = await res.json();
      return data.title ?? null;
    }
    if (type === "twitter") {
      const res = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`
      );
      const data = await res.json();
      return data.author_name ? `Tweet by ${data.author_name}` : null;
    }
  } catch {}
  return null;
}

export function CreateContentModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (content: { title: string; link: string; type: string }) => void;
}) {
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ContentType>(contentTypes.Youtube);
  const [fetching, setFetching] = useState(false);

  // Auto-detect type + fetch title when link changes
  useEffect(() => {
    if (!link) return;
    const timer = setTimeout(async () => {
      const detected = detectType(link);
      if (!detected) return;
      setType(detected);
      if (title) return; // don't overwrite if user already typed a title
      setFetching(true);
      const fetched = await fetchTitle(link, detected);
      if (fetched) setTitle(fetched);
      setFetching(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [link]);

  function handleClose() {
    setLink("");
    setTitle("");
    setType(contentTypes.Youtube);
    onClose();
  }

  function addContent() {
    const t = title.trim();
    const l = link.trim();
    if (!t || !l) return;
    onAdd({ title: t, link: l, type });
    setLink("");
    setTitle("");
    setType(contentTypes.Youtube);
    onClose();
  }

  return (
    <div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-800 opacity-60" onClick={handleClose} />
          <div className="relative bg-slate-700 p-6 rounded-md shadow-md border-2 border-slate-600 w-80">
            <div className="flex justify-end mb-2">
              <div onClick={handleClose} className="cursor-pointer text-slate-300 hover:text-white text-lg">
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
                onChange={(e) => setLink(e.target.value)}
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
                onChange={(e) => setTitle(e.target.value)}
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

            <div className="flex justify-center">
              <Button onClick={addContent} variant="primary" text="Submit" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
