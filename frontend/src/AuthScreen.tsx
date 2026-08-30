import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "./supabaseClient";
import heroImage from "./assets/hero.png";
import "./AuthScreen.css";

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsLoading(true);

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (signUpError) throw signUpError;

        // If email confirmation is required, Supabase returns a user but no
        // active session yet — the app won't move forward until they click
        // the link in their inbox. Tell them explicitly instead of doing
        // nothing visible.
        if (data.user && !data.session) {
          setInfoMessage("Check your email to confirm your account, then log in.");
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleAuth() {
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (oauthError) setError(oauthError.message);
  }

  return (
    <div className="auth-shell">
      <div className="auth-form-side">
        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
        <span className="auth-eyebrow">NEXPATH</span>
        <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-sub">
          {mode === "signup" ? "Let's find where you're headed." : "Pick up where you left off."}
        </p>

        <motion.button
          className="auth-google-btn"
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
          onClick={handleGoogleAuth}
          type="button"
        >
          Continue with Google
        </motion.button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form onSubmit={handleEmailAuth} className="auth-form">
          {mode === "signup" && (
            <input
              className="auth-input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            className="auth-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          {error && <p className="auth-error">{error}</p>}
          {infoMessage && <p className="auth-info">{infoMessage}</p>}

          <motion.button
            className="auth-submit"
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? "Please wait..." : mode === "signup" ? "Sign up" : "Log in"}
          </motion.button>
        </form>

        <button
          className="auth-switch"
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          type="button"
        >
          {mode === "signup" ? "Already have an account? Log in" : "New here? Sign up"}
        </button>
        </motion.div>
      </div>

      <div className="auth-visual-side" style={{ backgroundImage: `url(${heroImage})` }}>
        <div className="auth-visual-overlay">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="auth-visual-copy"
          >
            <span className="text-mono auth-visual-eyebrow">CAREER AI RECOMMENDER</span>
            <h2 className="text-h1">Your path, mapped from where you actually stand.</h2>
            <p className="text-body">
              Tell NexPath your goal, your level, and what you already know — get a
              sequenced roadmap of milestones, not just another course list.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}