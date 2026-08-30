/**
 * explainService.js — NexPath explanation & assistant layer (Gemini)
 *
 * Usage:
 *   npm install dotenv node-fetch@2
 *   Create a .env file in backend/ with:
 *     GEMINI_API_KEY=your_key_here
 *
 * Get a free key at: https://aistudio.google.com/apikey
 *
 * Exports:
 *   explainRecommendation(query, item, prereqNames, profile) - why this
 *     course/skill fits, personalized with the learner's stated level and
 *     known skills when available
 *   explainDomainFit(query, domainLabel, topItemName, score) - why this whole
 *     direction/domain is worth exploring (used by the possibility-map step)
 *   explainPathOverview(params) - a single "why this roadmap" paragraph tying
 *     the learner's profile to the shape of the generated path
 *   answerLearnerQuery(params) - free-form Q&A about the learner's path,
 *     used by the in-dashboard AI assistant
 */

require("dotenv").config();
const fetch = require("node-fetch");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.6-flash"; // current fast/cheap model as of this build
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

async function callGemini(prompt, maxOutputTokens = 220) {
  if (!GEMINI_API_KEY) {
    return null; // caller falls back to its own default text
  }

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens, temperature: 0.7 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? sanitizeExplanation(text.trim()) : null;
  } catch (err) {
    console.error("Gemini call failed:", err.message);
    return null;
  }
}

// Catches the failure mode where the model echoes formatting instructions
// back instead of answering (e.g. "Plain text only, no markdown...").
// If we detect that, treat it as no usable answer so the caller falls back.
function sanitizeExplanation(text) {
  const badPatterns = [/plain text only/i, /no markdown/i, /label prefix/i, /^explanation:/i, /^bridge:/i];
  if (badPatterns.some((p) => p.test(text))) {
    return null;
  }
  // Strip a stray leading label like "Explanation:" or "**Bridge:**" if present
  // without the whole string being instruction-echo.
  return text.replace(/^(\*\*)?[A-Za-z ]{2,20}:(\*\*)?\s*/, "").trim();
}

function describeProfile(profile = {}) {
  const bits = [];
  if (profile.level) bits.push(`self-rated level: ${profile.level}`);
  if (profile.knownSkills && profile.knownSkills.length) {
    bits.push(`already comfortable with: ${profile.knownSkills.join(", ")}`);
  }
  if (profile.priorExperience) bits.push(`prior experience: ${profile.priorExperience}`);
  return bits.length ? bits.join("; ") : null;
}

/**
 * @param {string} learnerQuery
 * @param {object} item - { name, skills, difficulty, domain }
 * @param {string[]} prereqNames
 * @param {object} [profile] - { level, knownSkills, priorExperience }
 * @returns {Promise<string>}
 */
async function explainRecommendation(learnerQuery, item, prereqNames = [], profile = {}) {
  const prereqContext = prereqNames.length
    ? `It builds on ${prereqNames.join(", ")}.`
    : "It has no prerequisites in this path.";
  const profileContext = describeProfile(profile);

  const prompt = `You're a friendly, direct mentor talking to a learner who said: "${learnerQuery}"
${profileContext ? `What you know about them: ${profileContext}.` : ""}

Write exactly 2 sentences, in plain conversational prose, explaining why "${item.name}" (a ${item.difficulty} level ${item.domain} course) is a good next step for THEM specifically — refer to their stated level or known skills if it's relevant, not generic praise. ${prereqContext}
Just write the 2 sentences. Nothing else — no headings, no labels, no formatting notes.`;

  const result = await callGemini(prompt);
  if (result) return result;

  // Fallback keeps the same "personalized, not generic" spirit even
  // without an API key.
  const levelBit = profile.level ? ` given you're starting from ${profile.level.toLowerCase()}` : "";
  return `Recommended${levelBit} based on your goal: "${learnerQuery}". ${prereqContext}`;
}

/**
 * Explains why a whole DOMAIN (not a single course) is worth exploring —
 * used by the possibility-map step shown before a full path is generated.
 *
 * @param {string} learnerQuery
 * @param {string} domainLabel - human-readable, e.g. "Web Development"
 * @param {string} topItemName - best-matching course/skill name in this domain
 * @param {number} score - similarity score (0-1)
 * @returns {Promise<string>}
 */
async function explainDomainFit(learnerQuery, domainLabel, topItemName, score) {
  const prompt = `You're a friendly, direct mentor talking to a learner who said: "${learnerQuery}"

Write exactly 1 enthusiastic sentence explaining why "${domainLabel}" could be a great direction for them, given what they said. Mention "${topItemName}" as a natural starting point.
Just write the 1 sentence. Nothing else — no headings, no labels, no formatting notes.`;

  const result = await callGemini(prompt);
  return result || `Worth exploring based on your interests: "${learnerQuery}".`;
}

/**
 * A single paragraph explaining the SHAPE of the whole generated roadmap —
 * why it has this many milestones, why it starts where it starts, and how
 * it reflects what the learner told us. Shown at the top of the dashboard
 * so "explainability" is visible before the learner opens a single item.
 *
 * @param {object} params
 * @param {string} params.query
 * @param {string} params.domainLabel
 * @param {number} params.milestoneCount
 * @param {number} params.itemCount
 * @param {number} params.skippedKnownCount - items excluded because the
 *   learner already reported knowing them
 * @param {object} [params.profile]
 */
async function explainPathOverview({ query, domainLabel, milestoneCount, itemCount, skippedKnownCount = 0, profile = {} }) {
  const profileContext = describeProfile(profile);
  const skipLine = skippedKnownCount > 0
    ? `${skippedKnownCount} item(s) were left out because the learner already reported knowing that material.`
    : "";

  const prompt = `You're a friendly, direct mentor. A learner described their goal as: "${query}", aiming at ${domainLabel}.
${profileContext ? `What you know about them: ${profileContext}.` : ""}
You generated a roadmap of ${milestoneCount} milestones covering ${itemCount} items, ordered by prerequisites. ${skipLine}

Write exactly 2-3 sentences explaining the REASONING behind this roadmap's shape — why it's sequenced this way and how it reflects what they told you. Speak directly to the learner ("you"). No headings, no labels, no formatting notes — just the sentences.`;

  const result = await callGemini(prompt, 260);
  if (result) return result;

  const skipBit = skippedKnownCount > 0 ? ` We skipped ${skippedKnownCount} item(s) you already know.` : "";
  return `This roadmap has ${milestoneCount} milestones covering ${itemCount} items in ${domainLabel}, ordered so each step's prerequisites come first.${skipBit} It's built directly from what you told us about your goal, level, and interests.`;
}

/**
 * Free-form Q&A about the learner's path — this is the ONE place in the
 * product that should feel like a conversational assistant, separate from
 * the structured onboarding wizard.
 *
 * @param {object} params
 * @param {string} params.query - the learner's original goal
 * @param {string} params.question - what they're asking right now
 * @param {string[]} [params.milestoneNames] - names of items in their path,
 *   for grounding the answer
 */
async function answerLearnerQuery({ query, question, milestoneNames = [] }) {
  const pathContext = milestoneNames.length
    ? `Their current roadmap includes: ${milestoneNames.slice(0, 12).join(", ")}.`
    : "They don't have a generated roadmap yet.";

  const prompt = `You're NexPath's learning assistant. A learner whose stated goal is: "${query}" is asking you:
"${question}"

${pathContext}

Answer helpfully and specifically in 2-4 sentences, plain conversational prose, referencing their actual roadmap where relevant. If the question is unrelated to learning/career paths, gently steer back to what you can help with. No headings, no labels, no formatting notes.`;

  const result = await callGemini(prompt, 260);
  return (
    result ||
    "I can't reach the AI assistant right now, but based on your current roadmap, I'd suggest focusing on the next unfinished milestone and using \"Why this?\" on each item for a quick rationale."
  );
}

module.exports = {
  explainRecommendation,
  explainDomainFit,
  explainPathOverview,
  answerLearnerQuery,
};
