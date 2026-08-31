import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeProvider } from "./ThemeContext";
import { useSupabaseSession } from "./useSupabaseSession";
import { supabase } from "./supabaseClient";
import NavBar from "./NavBar";
import AuthScreen from "./AuthScreen";
import ProfileWizard from "./ProfileWizard";
import PossibilityMap from "./PossibilityMap";
import PathDashboard from "./PathDashboard";
import ProfilePage from "./ProfilePage";
import { stageTransition } from "./motionVariants";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

type Stage = "onboarding" | "possibilities" | "path" | "profile";

function AppContent() {
  const { session, isLoading: sessionLoading } = useSupabaseSession();
  const [stage, setStage] = useState<Stage>("onboarding");
  const [query, setQuery] = useState("");
  const [knownSkills, setKnownSkills] = useState<string[]>([]);
  const [priorExperience, setPriorExperience] = useState("");
  const [pathResult, setPathResult] = useState<any>(null);
  const [completedItemIds, setCompletedItemIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const learnerId = session?.user?.id || "";
  const learnerName = session?.user?.user_metadata?.name || session?.user?.email;

  function fetchPath(forQuery: string, forDomain: string) {
    const safeQuery = forQuery.trim() || query.trim() || "computer science and web development";
    setIsLoading(true);
    setError(null);

    return fetch(`${BACKEND_URL}/path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: safeQuery,
        domain: forDomain,
        top_k: 8,
        learnerId,
        knownSkills,
        priorExperience,
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Backend returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setPathResult(data);
        setStage("path");
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      })
      .finally(() => setIsLoading(false));
  }

  function handleOnboardingComplete(finishedQuery: string, skills: string[], priorExp: string) {
    setQuery(finishedQuery);
    setKnownSkills(skills);
    setPriorExperience(priorExp);
    setStage("possibilities");
  }

  function handleDomainSelect(selectedDomain: string) {
    fetchPath(query, selectedDomain);
  }

  function handleRefresh(status: "completed" | "struggled", itemId: string) {
    if (status === "completed") {
      setCompletedItemIds((prev) => {
        if (prev.has(itemId)) return prev;
        const next = new Set(prev);
        next.add(itemId);
        return next;
      });
    }
    // NOTE: We do NOT re-fetch the path here. Re-fetching caused the backend
    // to filter out completed items, making milestones vanish from the UI.
    // Completion state is tracked locally in PathDashboard via completedIds.
  }

  function handleStartOver() {
    setStage("onboarding");
    setQuery("");
    setKnownSkills([]);
    setPriorExperience("");
    setPathResult(null);
    setCompletedItemIds(new Set());
    setError(null);
  }

  if (sessionLoading) {
    return null;
  }

  if (!session) {
    return (
      <>
        <NavBar userName={null} onSignOut={() => {}} onLogoClick={() => {}} />
        <AuthScreen />
      </>
    );
  }

  return (
    <>
      <NavBar
        userName={learnerName}
        activeStage={stage}
        hasPath={!!pathResult}
        onSelectStage={(s) => setStage(s)}
        onSignOut={() => supabase.auth.signOut()}
        onLogoClick={handleStartOver}
      />

      <main style={{ position: "relative", zIndex: 1 }}>
        <AnimatePresence mode="wait">
          {stage === "onboarding" && (
            <motion.div key="onboarding" {...stageTransition}>
              <ProfileWizard onComplete={handleOnboardingComplete} />
            </motion.div>
          )}

          {stage === "possibilities" && (
            <motion.div key="possibilities" {...stageTransition}>
              <PossibilityMap query={query || "computer science and web development"} onSelect={handleDomainSelect} />
            </motion.div>
          )}

          {stage === "path" && pathResult && (
            <motion.div key="path" {...stageTransition}>
              <PathDashboard
                data={pathResult}
                learnerId={learnerId}
                completedCount={completedItemIds.size}
                onRefresh={handleRefresh}
                onStartOver={handleStartOver}
              />
            </motion.div>
          )}

          {stage === "profile" && (
            <motion.div key="profile" {...stageTransition}>
              <ProfilePage learnerId={learnerId} learnerName={learnerName || "Learner"} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              background: "var(--bg-panel-solid)",
              border: "1px solid var(--border-glow)",
              borderRadius: 30,
              padding: "10px 20px",
              color: "var(--text-primary)",
              boxShadow: "var(--shadow-glow)",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
              zIndex: 999,
            }}
          >
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
              ⚙️
            </motion.span>
            Generating Path...
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "rgba(255, 107, 157, 0.2)",
            border: "1px solid var(--accent-pink)",
            borderRadius: 16,
            padding: "10px 20px",
            color: "var(--text-primary)",
            fontSize: 13,
            zIndex: 999,
          }}
        >
          Error: {error}
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;