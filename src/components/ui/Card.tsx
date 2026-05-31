import { useEffect } from "react";
import { ShareIcon } from "../../icons/ShareIcon";
import { DeleteIcon } from "../../icons/DeleteIcon";

interface CardProps {
  title: string;
  link: string;
  type: "twitter" | "youtube";
  tags?: string[];
  onDelete?: () => void;
}

const TAG_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-yellow-100 text-yellow-700",
  "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
  "bg-teal-100 text-teal-700",
];

function tagColor(tag: string) {
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TAG_COLORS[h % TAG_COLORS.length];
}

function getYoutubeEmbedUrl(link: string): string {
  try {
    const url = new URL(link);
    if (url.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${url.pathname}`;
    }
    const videoId = url.searchParams.get("v");
    if (videoId) return `https://www.youtube.com/embed/${videoId}`;
  } catch {}
  return link;
}

export function Card({ title, link, type, tags, onDelete }: CardProps) {
  useEffect(() => {
    if (type === "twitter") {
      const twttr = (window as any).twttr;
      if (twttr?.widgets?.load) twttr.widgets.load();
    }
  }, [type, link]);

  return (
    <div className="p-2">
      <div className="p-4 bg-white rounded-md border-gray-200 max-w-72 border">

        <div className="flex justify-between">
          <div className="flex items-center text-md truncate pr-2">
            <div className="text-gray-500 pr-2 shrink-0">
              <ShareIcon />
            </div>
            <span className="truncate">{title}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <a href={link} target="_blank" className="text-gray-500 hover:text-purple-600">
              <ShareIcon />
            </a>
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <DeleteIcon />
              </button>
            )}
          </div>
        </div>

        <div className="pt-4">
          {type === "youtube" && (
            <iframe
              className="w-full"
              height="200"
              src={getYoutubeEmbedUrl(link)}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
          {type === "twitter" && (
            <blockquote className="twitter-tweet">
              <a href={link}></a>
            </blockquote>
          )}
        </div>

        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {tags.map((tag) => (
              <span
                key={tag}
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${tagColor(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
