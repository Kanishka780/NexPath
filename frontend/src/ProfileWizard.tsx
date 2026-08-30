import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./ProfileWizard.css";

const BACKEND_URL = "http://localhost:4000";

type DomainOption = {
  id: string;
  label: string;
  icon: string;
  desc: string;
  available: boolean;
};

const DOMAIN_OPTIONS: DomainOption[] = [
  { id: "webdev", label: "Web Development", icon: "🌐", desc: "Frontend, backend & fullstack apps", available: true },
  { id: "ml", label: "AI & Machine Learning", icon: "🤖", desc: "Neural networks, deep learning & LLMs", available: true },
  { id: "datasci", label: "Data Science & Analytics", icon: "📊", desc: "Data analysis, visualization & Python", available: true },
  { id: "law", label: "Law & Public Policy", icon: "⚖️", desc: "Corporate law, cyber law & governance", available: false },
  { id: "health", label: "Healthcare & Biotech", icon: "🧬", desc: "Biomedical science & health tech", available: false },
  { id: "business", label: "Business & Finance", icon: "💼", desc: "Entrepreneurship & product strategy", available: false },
];

// Fallback skill lists in case the backend isn't reachable yet — keeps the
// wizard usable offline/while the server is still spinning up. These mirror
// backend/skillTaxonomy.js exactly.
const FALLBACK_SKILLS: Record<string, string[]> = {
  webdev: ["HTML & CSS basics", "JavaScript", "Front-end frameworks (React/Vue/Angular)", "Backend & APIs", "Databases & SQL", "Git & version control", "Cloud basics", "Web dev tooling & build tools"],
  ml: ["Python programming", "Statistics & probability", "Core ML algorithms", "Neural networks", "Deep learning", "TensorFlow / PyTorch", "NLP basics", "Applied ML projects"],
  datasci: ["Python for data", "SQL & databases", "Excel / spreadsheets", "Data visualization", "Statistics", "Exploratory data analysis", "Cloud platforms", "Data management / ETL"],
};

type WizardStepKey = "goal" | "interests" | "level" | "skills" | "time";

type Answers = {
  goal: string;
  domainId: string;
  interests: string;
  level: string;
  time: string;
};

interface ProfileWizardProps {
  onComplete: (query: string, knownSkills: string[], priorExperience: string) => void;
}

const cardVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, x: -24, transition: { duration: 0.2 } },
};

export default function ProfileWizard({ onComplete }: ProfileWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({ goal: "", domainId: "", interests: "", level: "", time: "" });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [priorExperience, setPriorExperience] = useState("");
  const [skillOptions, setSkillOptions] = useState<string[]>([]);
  const [unsupportedModal, setUnsupportedModal] = useState<string | null>(null);

  const STEP_ORDER: WizardStepKey[] = ["goal", "interests", "level", "skills", "time"];
  const currentKey = STEP_ORDER[stepIndex];

  useEffect(() => {
    if (!answers.domainId) return;
    let cancelled = false;
    fetch(`${BACKEND_URL}/skills/${answers.domainId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((data: { skills: { id: string; label: string }[] }) => {
        if (!cancelled) setSkillOptions(data.skills.map((s) => s.label));
      })
      .catch(() => {
        if (!cancelled) setSkillOptions(FALLBACK_SKILLS[answers.domainId] || []);
      });
    return () => {
      cancelled = true;
    };
  }, [answers.domainId]);

  function goNext() {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      setStepIndex(nextIndex);
    } else {
      finish();
    }
  }

  function finish() {
    const combinedQuery = [
      `goal: ${answers.goal}`,
      `interests: ${answers.interests}`,
      `level: ${answers.level}`,
      `time: ${answers.time}`,
    ].join(". ");
    onComplete(combinedQuery, selectedSkills, priorExperience.trim());
  }

  function selectDomain(domain: DomainOption) {
    if (!domain.available) {
      setUnsupportedModal(domain.label);
      return;
    }
    setAnswers((a) => ({ ...a, goal: domain.label, domainId: domain.id }));
    goNext();
  }

  function selectSingle(key: "interests" | "level" | "time", value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
    goNext();
  }

  function toggleSkill(label: string) {
    setSelectedSkills((prev) => (prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]));
  }

  const progressPct = Math.round(((stepIndex + 1) / STEP_ORDER.length) * 100);

  const STEP_META: Record<WizardStepKey, { eyebrow: string; title: string; subtitle: string }> = {
    goal: { eyebrow: "Step 1 of 5", title: "What are you building toward?", subtitle: "Pick the direction that's closest to your goal." },
    interests: { eyebrow: "Step 2 of 5", title: "What kind of work energizes you?", subtitle: "This shapes the flavor of what we recommend, not just the topic." },
    level: { eyebrow: "Step 3 of 5", title: "Where are you starting from?", subtitle: "Be honest — this changes the difficulty curve of your path." },
    skills: { eyebrow: "Step 4 of 5", title: "What do you already know?", subtitle: "Select anything you're already comfortable with — we'll skip re-teaching it." },
    time: { eyebrow: "Step 5 of 5", title: "How much time can you give this?", subtitle: "We'll pace your milestones around this." },
  };

  const INTEREST_OPTIONS = ["Coding & building things", "Data analysis & patterns", "AI model experiments", "Design & user research", "Research & writing"];
  const LEVEL_OPTIONS = ["Total beginner (starting fresh)", "Some self-taught basics", "Comfortable with fundamentals", "Intermediate, looking to specialize"];
  const TIME_OPTIONS = ["1-2 hrs/week (Casual)", "3-5 hrs/week (Steady)", "5-10 hrs/week (Focused)", "10+ hrs/week (Fast track)"];

  return (
    <div className="wizard-shell">
      <AnimatePresence>
        {unsupportedModal && (
          <motion.div className="wizard-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setUnsupportedModal(null)}>
            <motion.div className="wizard-modal" initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="wizard-modal-icon">⏳</div>
              <h2 className="text-h2">
                <strong>{unsupportedModal}</strong> is coming soon
              </h2>
              <p className="text-body text-muted">
                Our recommender currently has verified paths for Web Development, AI &amp; Machine Learning, and Data Science. Pick one of those to get a real roadmap today.
              </p>
              <button className="wizard-modal-close" onClick={() => setUnsupportedModal(null)}>
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="wizard-progress-track">
        <motion.div className="wizard-progress-fill" animate={{ width: `${progressPct}%` }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} />
      </div>

      <div className="wizard-dots">
        {STEP_ORDER.map((key, i) => (
          <div key={key} className={`wizard-dot ${i <= stepIndex ? "wizard-dot--active" : ""} ${i === stepIndex ? "wizard-dot--current" : ""}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={currentKey} className="wizard-card" variants={cardVariants} initial="initial" animate="animate" exit="exit">
          <span className="text-mono color-growth">{STEP_META[currentKey].eyebrow}</span>
          <h1 className="text-h1 margin-top-xs">{STEP_META[currentKey].title}</h1>
          <p className="text-body text-muted wizard-subtitle">{STEP_META[currentKey].subtitle}</p>

          {currentKey === "goal" && (
            <div className="wizard-option-grid wizard-option-grid--domains">
              {DOMAIN_OPTIONS.map((domain) => (
                <motion.button
                  key={domain.id}
                  className={`wizard-domain-card ${!domain.available ? "wizard-domain-card--soon" : ""}`}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => selectDomain(domain)}
                >
                  <span className="wizard-domain-icon">{domain.icon}</span>
                  <span className="wizard-domain-title">{domain.label}</span>
                  <span className="wizard-domain-desc">{domain.desc}</span>
                  {!domain.available && <span className="wizard-soon-badge text-mono">Soon</span>}
                </motion.button>
              ))}
            </div>
          )}

          {currentKey === "interests" && (
            <div className="wizard-option-list">
              {INTEREST_OPTIONS.map((opt) => (
                <motion.button key={opt} className="wizard-option-pill" whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }} onClick={() => selectSingle("interests", opt)}>
                  {opt}
                </motion.button>
              ))}
            </div>
          )}

          {currentKey === "level" && (
            <div className="wizard-option-list">
              {LEVEL_OPTIONS.map((opt) => (
                <motion.button key={opt} className="wizard-option-pill" whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }} onClick={() => selectSingle("level", opt)}>
                  {opt}
                </motion.button>
              ))}
            </div>
          )}

          {currentKey === "skills" && (
            <>
              <div className="wizard-skill-grid">
                {(skillOptions.length ? skillOptions : FALLBACK_SKILLS[answers.domainId] || []).map((skill) => {
                  const active = selectedSkills.includes(skill);
                  return (
                    <motion.button
                      key={skill}
                      className={`wizard-skill-chip ${active ? "wizard-skill-chip--active" : ""}`}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleSkill(skill)}
                    >
                      {active ? "✓ " : ""}
                      {skill}
                    </motion.button>
                  );
                })}
              </div>
              <div className="wizard-experience-field">
                <label className="text-mono wizard-experience-label">Anything else you've completed? (optional)</label>
                <input
                  className="wizard-experience-input"
                  placeholder="e.g. finished a Udemy React course, built two small projects..."
                  value={priorExperience}
                  onChange={(e) => setPriorExperience(e.target.value)}
                />
              </div>
              <motion.button className="wizard-continue-btn" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={goNext}>
                Continue ➔
              </motion.button>
            </>
          )}

          {currentKey === "time" && (
            <div className="wizard-option-list">
              {TIME_OPTIONS.map((opt) => (
                <motion.button key={opt} className="wizard-option-pill" whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }} onClick={() => selectSingle("time", opt)}>
                  {opt}
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {stepIndex > 0 && (
        <button className="wizard-back-btn text-mono" onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>
          ← Back
        </button>
      )}
    </div>
  );
}
