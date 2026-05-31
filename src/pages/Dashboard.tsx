import { useState, useEffect } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CreateContentModal } from "../components/ui/CreateContentModal";
import { SmartSearch } from "../components/ui/SmartSearch";
import { PlusIcon } from "../icons/PlusIcon";
import { ShareIcon } from "../icons/ShareIcon";
import { Sidebar } from "../components/ui/Sidebar";
import { useContentTags } from "../hooks/useContentTags";

interface Content {
  type: string;
  title: string;
  link: string;
}

function Dashboard() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [contents, setContents] = useState<Content[]>(() => {
    try { return JSON.parse(localStorage.getItem("brainly_contents") ?? "[]"); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("brainly_contents", JSON.stringify(contents));
  }, [contents]);
  const [searchResults, setSearchResults] = useState<Content[] | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const { tagMap, allTags } = useContentTags(contents);

  const displayedContents =
    searchResults !== null
      ? searchResults
      : contents.filter((c) => {
          const typeMatch = !selectedType || c.type?.toLowerCase() === selectedType.toLowerCase();
          const tagMatch = !selectedTag || (tagMap[c.link] ?? []).includes(selectedTag);
          return typeMatch && tagMatch;
        });

  function handleDelete(index: number) {
    setContents((prev) => prev.filter((_, i) => i !== index));
  }

  function handleShareBrain() {
    if (contents.length === 0) {
      alert("Add some content first before sharing!");
      return;
    }
    const encoded = btoa(JSON.stringify(contents));
    const url = `${window.location.origin}/brain/view#${encoded}`;
    navigator.clipboard.writeText(url);
    alert("Share link copied to clipboard!");
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
          onAdd={(newContent) => setContents((prev) => [...prev, newContent])}
        />
        <div className="flex justify-end gap-4 mb-4">
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
            if (results !== null) setSelectedType(null);
          }}
        />

        <div className="flex gap-4 mt-2 flex-wrap">
          {displayedContents.length > 0 ? (
            displayedContents.map((content, index) => (
              <Card
                key={content.link + index}
                type={content.type as "twitter" | "youtube"}
                link={content.link}
                title={content.title}
                tags={tagMap[content.link]}
                onDelete={() => handleDelete(contents.indexOf(content))}
              />
            ))
          ) : (
            <div className="text-gray-500 w-full mt-10 text-center text-lg">
              {searchResults !== null ? "No results match your search." : `No content yet — click "Add Content" to get started.`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
