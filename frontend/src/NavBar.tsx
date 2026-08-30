import { motion } from "framer-motion";
import { useTheme } from "./ThemeContext";
import "./NavBar.css";

type Stage = "onboarding" | "possibilities" | "path" | "profile";

interface NavBarProps {
  userName: string | null;
  activeStage?: Stage;
  hasPath?: boolean;
  onSelectStage?: (stage: Stage) => void;
  onSignOut: () => void;
  onLogoClick: () => void;
}

export default function NavBar({
  userName,
  activeStage = "onboarding",
  hasPath = false,
  onSelectStage,
  onSignOut,
  onLogoClick,
}: NavBarProps) {
  const { mode, resolvedTheme, cycleMode } = useTheme();

  const icon = mode === "system" ? "🖥" : resolvedTheme === "dark" ? "🌙" : "☀️";
  const label = mode === "system" ? "System" : resolvedTheme === "dark" ? "Dark" : "Light";

  const navItems: { id: Stage; label: string; icon: string; disabled?: boolean }[] = [
    { id: "onboarding", label: "Path Finder", icon: "💬" },
    { id: "possibilities", label: "Explore Domains", icon: "🗺️" },
    { id: "path", label: "My Milestones", icon: "🎯", disabled: !hasPath },
    { id: "profile", label: "My Profile", icon: "🪪" },
  ];

  return (
    <header className="navbar-container">
      <nav className="navbar">
        <button className="navbar-brand" onClick={onLogoClick} title="Reset & Start over">
          <div className="navbar-mark">
            <span>N</span>
          </div>
          <div className="navbar-title-wrap">
            <span className="navbar-name">NexPath</span>
            <span className="navbar-tagline text-mono">Career AI Recommender</span>
          </div>
        </button>

        {userName && onSelectStage && (
          <div className="navbar-nav">
            {navItems.map((item) => {
              const isActive = activeStage === item.id;
              return (
                <button
                  key={item.id}
                  className={`nav-tab ${isActive ? "nav-tab--active" : ""} ${item.disabled ? "nav-tab--disabled" : ""}`}
                  onClick={() => !item.disabled && onSelectStage(item.id)}
                  disabled={item.disabled}
                  title={item.disabled ? "Complete path onboarding first to unlock milestones" : undefined}
                >
                  <span className="nav-tab-icon">{item.icon}</span>
                  <span className="nav-tab-label">{item.label}</span>
                  {isActive && (
                    <motion.div
                      className="nav-tab-indicator"
                      layoutId="activeTabIndicator"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="navbar-right">
          {userName && (
            <div className="navbar-user-chip">
              <span className="user-avatar">{userName.charAt(0).toUpperCase()}</span>
              <span className="navbar-user">{userName}</span>
              <button className="navbar-signout" onClick={onSignOut} title="Sign Out">
                Sign out
              </button>
            </div>
          )}

          <button className="navbar-theme-toggle" onClick={cycleMode} title="Toggle theme">
            <span className="navbar-theme-icon">{icon}</span>
            <span className="navbar-theme-label">{label}</span>
          </button>
        </div>
      </nav>
    </header>
  );
}