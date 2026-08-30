import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AskAssistant from "./AskAssistant";
import "./PathDashboard.css";

const BACKEND_URL = "http://localhost:4000";

type Item = {
  id: string;
  name: string;
  difficulty: string;
  domain: string;
  needsRevision?: boolean;
};

type Milestone = {
  milestone: number;
  items: Item[];
};

type SkillCoverageEntry = {
  id: string;
  label: string;
  status: "known" | "planned" | "gap";
};

type PathData = {
  query: string;
  total_items_in_path: number;
  milestones: Milestone[];
  pathSummary?: string;
  skillCoverage?: SkillCoverageEntry[];
  skippedKnownCount?: number;
};

interface PathDashboardProps {
  data: PathData;
  learnerId: string;
  completedCount: number;
  onRefresh: (status: "completed" | "struggled", itemId: string) => void;
  onStartOver: () => void;
}

export default function PathDashboard({
  data,
  learnerId,
  completedCount,
  onRefresh,
  onStartOver,
}: PathDashboardProps) {
  const [expandedMilestone, setExpandedMilestone] = useState<number>(1);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [loadingExplain, setLoadingExplain] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  // Local tracking of struggling and completed items
  const [struggledIds, setStruggledIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Collect all initial revision items from backend
    const initialStruggles = new Set<string>();
    data.milestones.forEach((m) => {
      m.items.forEach((item) => {
        if (item.needsRevision) initialStruggles.add(item.id);
      });
    });
    setStruggledIds(initialStruggles);
  }, [data]);

  const total = data.total_items_in_path + completedCount;
  const progressPct = total > 0 ? Math.min(100, Math.round((completedCount / total) * 100)) : 0;

  const nextItem = data.milestones[0]?.items.find((i) => !completedIds.has(i.id)) || data.milestones[0]?.items[0] || null;

  async function handleExplain(itemId: string) {
    if (explanations[itemId]) return;
    setLoadingExplain(itemId);
    try {
      const res = await fetch(`${BACKEND_URL}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: data.query, itemId, learnerId }),
      });
      const json = await res.json();
      setExplanations((prev) => ({ ...prev, [itemId]: json.explanation }));
    } catch {
      setExplanations((prev) => ({ ...prev, [itemId]: "Couldn't load an explanation right now." }));
    } finally {
      setLoadingExplain(null);
    }
  }

  async function handleFeedback(itemId: string, status: "completed" | "struggled") {
    if (busyItem === itemId) return;
    
    // Prevent double processing if already in target state
    if (status === "completed" && completedIds.has(itemId)) return;

    setBusyItem(itemId);
    try {
      await fetch(`${BACKEND_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learnerId, itemId, status }),
      });

      if (status === "struggled") {
        setStruggledIds((prev) => new Set(prev).add(itemId));
      } else if (status === "completed") {
        setCompletedIds((prev) => new Set(prev).add(itemId));
        setStruggledIds((prev) => {
          const updated = new Set(prev);
          updated.delete(itemId);
          return updated;
        });
      }

      onRefresh(status, itemId);
    } catch (err) {
      console.error("Feedback error", err);
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <div className="dashboard-shell">
      {/* Top Banner Dashboard Summary */}
      <motion.div
        className="dashboard-top"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="progress-ring-wrap">
          <svg viewBox="0 0 100 100" className="progress-ring">
            <circle cx="50" cy="50" r="42" className="progress-ring-bg" />
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              className="progress-ring-fill"
              strokeDasharray={264}
              initial={{ strokeDashoffset: 264 }}
              animate={{ strokeDashoffset: 264 - (264 * progressPct) / 100 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <span className="progress-ring-label">{progressPct}%</span>
        </div>

        <div className="dashboard-summary">
          <span className="dashboard-eyebrow text-mono">YOUR RECOMENDED PATH</span>
          <h1 className="text-h1">{completedCount} of {total} milestones completed</h1>
          {nextItem && (
            <p className="dashboard-next text-body">
              Current focus: <strong>{nextItem.name}</strong>
            </p>
          )}
        </div>

        <motion.button
          className="dashboard-restart"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={onStartOver}
        >
          🔄 Start New Path
        </motion.button>
      </motion.div>

      {/* Why this path — makes the roadmap's reasoning visible up front */}
      {data.pathSummary && (
        <motion.div
          className="path-summary-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <span className="text-mono color-growth">WHY THIS ROADMAP</span>
          <p className="text-body path-summary-text">{data.pathSummary}</p>
          {typeof data.skippedKnownCount === "number" && data.skippedKnownCount > 0 && (
            <span className="path-summary-skip text-mono">
              ⏭ Skipped {data.skippedKnownCount} item(s) you already know
            </span>
          )}
        </motion.div>
      )}

      {/* Skill growth — known vs. planned vs. still a gap, for this domain */}
      {data.skillCoverage && data.skillCoverage.length > 0 && (
        <motion.div
          className="skill-growth-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <span className="text-mono color-growth">SKILL DEVELOPMENT</span>
          <div className="skill-growth-grid">
            {data.skillCoverage.map((s) => (
              <div key={s.id} className={`skill-chip skill-chip--${s.status}`}>
                <span className="skill-chip-dot" />
                {s.label}
              </div>
            ))}
          </div>
          <div className="skill-growth-legend text-mono text-muted">
            <span><span className="legend-dot legend-dot--known" /> Known</span>
            <span><span className="legend-dot legend-dot--planned" /> In your path</span>
            <span><span className="legend-dot legend-dot--gap" /> Not yet covered</span>
          </div>
        </motion.div>
      )}

      {/* Milestones Accordion List */}
      <div className="milestone-list">
        {data.milestones.map((m, mi) => {
          const isOpen = expandedMilestone === m.milestone;
          const milestoneCompletedCount = m.items.filter((item) => completedIds.has(item.id)).length;
          const isMilestoneDone = milestoneCompletedCount === m.items.length && m.items.length > 0;

          return (
            <motion.div
              key={m.milestone}
              className={`milestone-card ${isOpen ? "milestone-card--open" : ""} ${isMilestoneDone ? "milestone-card--done" : ""}`}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, margin: "-40px" }}
              transition={{ delay: mi * 0.05, duration: 0.4 }}
            >
              <button
                className="milestone-header"
                onClick={() => setExpandedMilestone(isOpen ? -1 : m.milestone)}
              >
                <div className="milestone-index">{isMilestoneDone ? "✓" : m.milestone}</div>
                <div className="milestone-title-wrap">
                  <span className="milestone-title">Milestone {m.milestone}</span>
                  <span className="milestone-subtitle text-body text-muted">
                    {milestoneCompletedCount} of {m.items.length} items finished
                  </span>
                </div>
                <motion.span
                  className="milestone-chevron"
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  ›
                </motion.span>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    className="milestone-body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {m.items.map((item) => {
                      const isItemCompleted = completedIds.has(item.id);
                      const isItemStruggling = struggledIds.has(item.id);

                      return (
                        <div key={item.id} className={`path-item ${isItemCompleted ? "path-item--completed" : ""}`}>
                          <div className="path-item-top">
                            <span className="path-item-name">{item.name}</span>
                            <span className={`badge badge--${item.difficulty.toLowerCase()}`}>
                              {item.difficulty}
                            </span>
                            {isItemStruggling && <span className="badge badge--revision">⚠️ Needs revision</span>}
                            {isItemCompleted && <span className="badge badge--completed">✓ Completed</span>}
                          </div>

                          <AnimatePresence>
                            {explanations[item.id] && (
                              <motion.p
                                className="path-item-explanation text-body"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                              >
                                💡 <strong>Why this step:</strong> {explanations[item.id]}
                              </motion.p>
                            )}
                          </AnimatePresence>

                          <div className="path-item-actions">
                            <button
                              className="path-action path-action--explain"
                              onClick={() => handleExplain(item.id)}
                              disabled={loadingExplain === item.id}
                            >
                              {loadingExplain === item.id ? "Analyzing..." : "Why this?"}
                            </button>

                            {!isItemCompleted ? (
                              <>
                                <button
                                  className={`path-action path-action--struggle ${isItemStruggling ? "path-action--active-struggle" : ""}`}
                                  onClick={() => handleFeedback(item.id, "struggled")}
                                  disabled={busyItem === item.id}
                                >
                                  {isItemStruggling ? "⚠️ Revision Flagged" : "I struggled"}
                                </button>
                                <button
                                  className="path-action path-action--complete"
                                  onClick={() => handleFeedback(item.id, "completed")}
                                  disabled={busyItem === item.id}
                                >
                                  {busyItem === item.id ? "Saving..." : "Mark complete ✓"}
                                </button>
                              </>
                            ) : (
                              <span className="item-done-tag text-mono">Completed</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      <AskAssistant query={data.query} milestoneNames={data.milestones.flatMap((m) => m.items.map((it) => it.name))} />
    </div>
  );
}

