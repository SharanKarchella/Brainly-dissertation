import { useState, useEffect } from "react";
import { Button }               from "../components/ui/Button";
import { Card }                 from "../components/ui/Card";
import { CreateContentModal }   from "../components/ui/CreateContentModal";
import { SmartSearch }          from "../components/ui/SmartSearch";
import { AIChatbot }            from "../components/ui/AIChatbot";
import { PlusIcon }             from "../icons/PlusIcon";
import { ShareIcon }            from "../icons/ShareIcon";
import { Sidebar }              from "../components/ui/Sidebar";
import { useContentTags }       from "../hooks/useContentTags";
import { encodeShare }          from "../utils/shareCodec";
import type { Content, RankedContent } from "../types";

function Dashboard() {
  const [modalOpen,     setModalOpen]     = useState(false);
  const [selectedType,  setSelectedType]  = useState<string | null>(null);
  const [selectedTag,   setSelectedTag]   = useState<string | null>(null);

  // Contents persisted to localStorage
  const [contents, setContents] = useState<Content[]>(() => {
    try { return JSON.parse(localStorage.getItem("brainly_contents") ?? "[]"); }
    catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem("brainly_contents", JSON.stringify(contents));
  }, [contents]);

  // Search results carry optional _score / _reason annotations
  const [searchResults, setSearchResults] = useState<RankedContent[] | null>(null);

  const { tagMap, allTags } = useContentTags(contents);

  // Smart-search results take priority; otherwise apply sidebar filters
  const displayedContents: RankedContent[] =
    searchResults !== null
      ? searchResults
      : contents.filter((c) => {
          const typeMatch = !selectedType || c.type?.toLowerCase() === selectedType.toLowerCase();
          const tagMatch  = !selectedTag  || (tagMap[c.link] ?? []).includes(selectedTag);
          return typeMatch && tagMatch;
        });

  // Delete by link rather than by index so it works correctly when
  // displayedContents is a re-mapped RankedContent[] (new object references)
  function handleDelete(link: string) {
    setContents((prev) => prev.filter((c) => c.link !== link));
    setSearchResults((prev) => prev ? prev.filter((c) => c.link !== link) : null);
  }

  // Transient feedback for the Share Brain button (replaces blocking alerts)
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  function flashShareMsg(msg: string) {
    setShareMsg(msg);
    setTimeout(() => setShareMsg(null), 2500);
  }

  async function handleShareBrain() {
    if (contents.length === 0) {
      flashShareMsg("Add some content first!");
      return;
    }
    const url = `${window.location.origin}/brain/view#${encodeShare(contents)}`;
    try {
      await navigator.clipboard.writeText(url);
      flashShareMsg("Share link copied!");
    } catch {
      console.log("[ShareBrain] link:", url);
      flashShareMsg("Copy failed — link logged to console.");
    }
  }

  return (
    <div>
      <Sidebar
        selectedType={selectedType}
        onTypeSelect={setSelectedType}
        allTags={allTags}
        selectedTag={selectedTag}
        onTagSelect={setSelectedTag}
      />

      <div className="p-4 ml-72 min-h-screen bg-gray-300">
        <CreateContentModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          // Prepend so the new card is immediately visible at the top of the grid
          onAdd={(newContent) => setContents((prev) => [newContent, ...prev])}
        />

        <div className="flex justify-end items-center gap-4 mb-4">
          {shareMsg && (
            <span className="text-sm text-purple-400">{shareMsg}</span>
          )}
          <Button
            variant="secondary"
            text="Share Brain"
            startIcon={<ShareIcon />}
            onClick={handleShareBrain}
          />
          <Button
            onClick={() => setModalOpen(true)}
            variant="primary"
            text="Add Content"
            startIcon={<PlusIcon />}
          />
        </div>

        <SmartSearch
          contents={contents}
          onResults={(results) => {
            setSearchResults(results);
            // Clear sidebar type filter when search is active so results aren't
            // double-filtered
            if (results !== null) setSelectedType(null);
          }}
        />

        <div className="flex gap-4 mt-2 flex-wrap">
          {displayedContents.length > 0 ? (
            displayedContents.map((content, index) => (
              <div key={content.link + index}>
                <Card
                  type={content.type as "twitter" | "youtube"}
                  link={content.link}
                  title={content.title}
                  tags={tagMap[content.link]}
                  onDelete={() => handleDelete(content.link)}
                />
                {/* Relevance score + reason — shown only in AI search mode */}
                {content._score !== undefined && (
                  <div className="text-xs text-gray-500 px-2 mt-0.5 max-w-72">
                    <span className="text-purple-600 font-medium">
                      {Math.round(content._score * 100)}% match
                    </span>
                    {content._reason && (
                      <span className="ml-1 text-gray-400 truncate block">
                        {content._reason}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-gray-500 w-full mt-10 text-center text-lg">
              {searchResults !== null
                ? "No results match your search."
                : `No content yet — click "Add Content" to get started.`}
            </div>
          )}
        </div>
      </div>

      <AIChatbot contents={contents} tagMap={tagMap} />
    </div>
  );
}

export default Dashboard;
