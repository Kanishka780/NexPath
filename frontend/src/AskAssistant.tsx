import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./AskAssistant.css";

const BACKEND_URL = "http://localhost:4000";

type ChatMessage = { role: "user" | "assistant"; text: string };

interface AskAssistantProps {
  query: string;
  milestoneNames: string[];
}

export default function AskAssistant({ query, milestoneNames }: AskAssistantProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Ask me anything about your roadmap — why an item is placed where it is, what to do if you're stuck, or what comes after this milestone." },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const question = input.trim();
    if (!question || isThinking) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setIsThinking(true);

    try {
      const res = await fetch(`${BACKEND_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, question, milestoneNames }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", text: data.answer || "I couldn't come up with an answer just now." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "I couldn't reach the assistant service just now — try again in a moment." }]);
    } finally {
      setIsThinking(false);
    }
  }

  return (
    <>
      <motion.button
        className="ask-fab"
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label="Ask the AI assistant about your path"
      >
        {open ? "✕" : "💬"}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="ask-panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="ask-panel-header">
              <span className="ask-panel-title text-h3">Path Assistant</span>
              <span className="text-mono ask-panel-sub">Ask about your roadmap</span>
            </div>

            <div className="ask-panel-scroll" ref={scrollRef}>
              {messages.map((m, i) => (
                <div key={i} className={`ask-bubble ask-bubble--${m.role}`}>
                  {m.text}
                </div>
              ))}
              {isThinking && <div className="ask-bubble ask-bubble--assistant ask-bubble--thinking">Thinking…</div>}
            </div>

            <div className="ask-panel-input-row">
              <input
                className="ask-panel-input"
                placeholder="Ask a question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button className="ask-panel-send" onClick={send} disabled={!input.trim() || isThinking}>
                ➔
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
