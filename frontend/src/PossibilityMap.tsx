import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import "./PossibilityMap.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

type Possibility = {
  domain: string;
  label: string;
  score: number;
  topItem: { id: string; name: string } | null;
  explanation: string;
};

interface PossibilityMapProps {
  query: string;
  onSelect: (domain: string) => void;
}

const gridVariants = {
  animate: { transition: { staggerChildren: 0.1 } },
};

export default function PossibilityMap({ query, onSelect }: PossibilityMapProps) {
  const [possibilities, setPossibilities] = useState<Possibility[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/possibilities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Backend returned ${r.status}`);
        return r.json();
      })
      .then((data) => setPossibilities(data.possibilities))
      .catch((err) => setError(err.message));
  }, [query]);

  if (error) {
    return (
      <div className="possibility-shell">
        <p className="possibility-error">Couldn't load directions to explore: {error}</p>
      </div>
    );
  }

  if (!possibilities) {
    return (
      <div className="possibility-shell">
        <motion.p
          className="possibility-loading"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          Looking at what could fit you...
        </motion.p>
      </div>
    );
  }

  return (
    <div className="possibility-shell">
      <motion.div
        className="possibility-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="possibility-eyebrow">DIRECTIONS WORTH EXPLORING</span>
        <h1>A few paths worth a look</h1>
        <p className="possibility-sub">
          These aren't verdicts — pick one to explore, you can always come back.
        </p>
      </motion.div>

      <motion.div className="possibility-grid" variants={gridVariants} initial="initial" animate="animate">
        {possibilities.map((p) => (
          <motion.div
            key={p.domain}
            className="possibility-card"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            whileHover={{ y: -6, boxShadow: "0 16px 34px rgba(0,0,0,0.18)" }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
          >
            <div className="possibility-card-top">
              <span className="possibility-match">{Math.round(p.score * 100)}% match</span>
              <h2>{p.label}</h2>
            </div>
            <p className="possibility-explanation">{p.explanation}</p>
            {p.topItem && <p className="possibility-topitem">Starting point: {p.topItem.name}</p>}
            <motion.button
              className="possibility-explore"
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(p.domain)}
            >
              Explore this path
            </motion.button>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}