/**
 * AIChatbot — floating conversational assistant that knows about the user's
 * saved content.
 *
 * Uses a standard messages API call (not tool_use) because the response here
 * is free-form text, not structured data.
 */
import { useState, useRef, useEffect } from "react";
import { logCost } from "../../ai/costs";
import type { Content } from "../../types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIChatbotProps {
  contents: Content[];
  tagMap:   Record<string, string[]>;
}

const WELCOME =
  'Hi! Ask me anything about your saved content. Try: "What have I saved?" or "What topics am I learning about?"';

export function AIChatbot({ contents, tagMap }: AIChatbotProps) {
  const [open,    setOpen]    = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "No API key found. Add VITE_ANTHROPIC_API_KEY to your .env file and restart the dev server.",
        },
      ]);
      setLoading(false);
      return;
    }

    // Build a content inventory string for the system prompt
    const contentList =
      contents.length > 0
        ? contents
            .map((c) => {
              const tags    = tagMap[c.link] ?? [];
              const tagPart = tags.length ? ` (tags: ${tags.join(", ")})` : "";
              return `- [${c.type.toUpperCase()}] "${c.title}"${tagPart}`;
            })
            .join("\n")
        : "No content saved yet.";

    const systemPrompt =
      `You are a helpful AI assistant for Brainly, a personal second-brain app. ` +
      `The user has saved the following content:\n\n${contentList}\n\n` +
      `Answer questions about their saved content concisely and helpfully. ` +
      `Summarise if asked what they've saved. Use the tags when asked about topics. ` +
      `Keep responses short and friendly.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
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
          system: systemPrompt,
          messages: [...messages, userMsg]
            .filter((m) => m.role !== "assistant" || m.content !== WELCOME)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      // Log token usage and estimated cost
      if (data.usage) logCost(data.usage, "AIChatbot");

      const reply = data.content?.[0]?.text ?? "Sorry, I couldn't get a response.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-xl flex items-center justify-center text-2xl z-50 transition-colors"
        title="Chat with your Brain"
      >
        {open ? "✕" : "✨"}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 w-80 h-[440px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-gray-200 overflow-hidden">
          <div className="bg-purple-600 text-white px-4 py-3 flex items-center gap-2 shrink-0">
            <span className="text-lg">✨</span>
            <div>
              <p className="font-semibold text-sm">Chat with your Brain</p>
              <p className="text-xs text-purple-200">{contents.length} items saved</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-purple-600 text-white rounded-br-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-3 py-2 rounded-2xl rounded-bl-sm text-sm text-gray-400 animate-pulse">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-gray-100 flex gap-2 shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ask about your content…"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
