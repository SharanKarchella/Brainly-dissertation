import { useEffect, useState } from "react";
import { Card } from "../components/ui/Card";
import { Logo } from "../icons/Logo";
import { decodeShare } from "../utils/shareCodec";

interface Content {
  type: "twitter" | "youtube";
  title: string;
  link: string;
}

export function SharedBrainView() {
  const [contents, setContents] = useState<Content[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      const hash = window.location.hash.slice(1);
      if (!hash) { setError(true); return; }
      const decoded = decodeShare<Content[]>(hash);
      setContents(decoded);
    } catch {
      setError(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-md p-4 mb-6">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="text-purple-600"><Logo /></div>
          <h1 className="text-2xl font-bold text-purple-600">Brainly — Shared Brain</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {error ? (
          <p className="text-center text-gray-500 mt-20 text-lg">Invalid or expired share link.</p>
        ) : contents.length === 0 ? (
          <p className="text-center text-gray-400 mt-20 text-lg">Loading...</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {contents.map((content, i) => (
              <Card
                key={content.link + i}
                type={content.type}
                link={content.link}
                title={content.title}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
