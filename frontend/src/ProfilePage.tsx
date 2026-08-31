import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import "./ProfilePage.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
type ProfileItem = { id: string; name: string; domain: string; difficulty: string };

type ProfileData = {
  learnerId: string;
  level: string;
  knownSkills: string[];
  priorExperience: string;
  completedItems: ProfileItem[];
  struggledItems: ProfileItem[];
};

interface ProfilePageProps {
  learnerId: string;
  learnerName: string;
}

export default function ProfilePage({ learnerId, learnerName }: ProfilePageProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!learnerId) return;
    fetch(`${BACKEND_URL}/profile/${learnerId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Backend returned ${r.status}`);
        return r.json();
      })
      .then(setProfile)
      .catch((err) => setError(err.message));
  }, [learnerId]);

  if (error) {
    return (
      <div className="profile-shell">
        <p className="profile-error">Couldn't load your profile: {error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-shell">
        <p className="profile-loading">Loading your profile...</p>
      </div>
    );
  }

  const hasAnySignal =
    profile.level || profile.knownSkills.length || profile.priorExperience || profile.completedItems.length;

  return (
    <div className="profile-shell">
      <motion.div
        className="profile-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="profile-eyebrow">YOUR PROFILE</span>
        <h1>{learnerName}</h1>
        <p className="profile-sub">This is what NexPath has learned about you so far.</p>
      </motion.div>

      {!hasAnySignal && (
        <p className="profile-empty">
          Nothing saved yet — go through the path finder once and this page will fill in.
        </p>
      )}

      {hasAnySignal && (
        <div className="profile-grid">
          {profile.level && (
            <motion.div className="profile-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <span className="profile-card-label">Self-rated level</span>
              <p className="profile-card-value">{profile.level}</p>
            </motion.div>
          )}

          {profile.knownSkills.length > 0 && (
            <motion.div
              className="profile-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <span className="profile-card-label">Skills you already know</span>
              <div className="profile-chip-row">
                {profile.knownSkills.map((skill) => (
                  <span key={skill} className="profile-chip">
                    {skill}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {profile.priorExperience && (
            <motion.div
              className="profile-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <span className="profile-card-label">Prior experience</span>
              <p className="profile-card-value">{profile.priorExperience}</p>
            </motion.div>
          )}

          {profile.completedItems.length > 0 && (
            <motion.div
              className="profile-card profile-card--wide"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <span className="profile-card-label">Completed so far</span>
              <ul className="profile-item-list">
                {profile.completedItems.map((item) => (
                  <li key={item.id} className="profile-item-row">
                    <span className="profile-item-name">{item.name}</span>
                    <span className={`profile-item-badge profile-item-badge--${item.difficulty.toLowerCase()}`}>
                      {item.difficulty}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {profile.struggledItems.length > 0 && (
            <motion.div
              className="profile-card profile-card--wide"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <span className="profile-card-label">Flagged for revision</span>
              <ul className="profile-item-list">
                {profile.struggledItems.map((item) => (
                  <li key={item.id} className="profile-item-row">
                    <span className="profile-item-name">{item.name}</span>
                    <span className={`profile-item-badge profile-item-badge--${item.difficulty.toLowerCase()}`}>
                      {item.difficulty}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}