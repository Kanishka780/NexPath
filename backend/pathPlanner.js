/**
 * pathPlanner.js — NexPath path generator (Node/Express)
 *
 * Usage:
 *   npm install express node-fetch@2 dotenv
 *   node pathPlanner.js
 *
 * Requires:
 *   - cleaned_corpus.json in this same folder
 *   - .env file with GEMINI_API_KEY=your_key_here
 *   - FastAPI ML service running on http://localhost:8000
 *
 * Routes:
 *   GET  /health           - sanity check
 *   GET  /skills/:domain   - the skill checklist shown during onboarding for a domain
 *   GET  /profile/:learnerId - the learner's stored profile (skills, level, prior
 *                              experience, completed/struggled item ids) without
 *                              needing to regenerate a path first
 *   POST /possibilities    - top domain matches with match score + explanation (possibility map)
 *   POST /path             - full recommend -> filter known -> expand -> sort -> milestone flow,
 *                            plus a "why this roadmap" summary and a skill-growth breakdown
 *   POST /explain          - Gemini-generated "why this" explanation for one item, personalized
 *                            to the learner's stated level/known skills when available
 *   POST /feedback         - mark an item completed/struggled, affects future /path calls
 *   POST /ask              - free-form Q&A about the learner's path (the one place with an
 *                            actual conversational assistant, separate from onboarding)
 *
 * Auth is handled client-side by Supabase (see frontend/src/supabaseClient.ts) —
 * not by this backend. The logged-in user's Supabase id/email is passed in
 * as learnerId from the frontend.
 */

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // npm install node-fetch@2
const fs = require("fs");
const path = require("path");
const { explainRecommendation, explainDomainFit, explainPathOverview, answerLearnerQuery } = require("./explainService");
const { getSkillOptions, getAllSkillOptions, textMatchesSkill } = require("./skillTaxonomy");

const app = express();
app.use(cors());
app.use(express.json());

const CORPUS_PATH = path.join(__dirname, "cleaned_corpus.json");
const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || "http://localhost:8000") + "/recommend";
const ITEMS_PER_MILESTONE = 3;

// Human-readable labels for the domains present in cleaned_corpus.json.
// Keep this in sync with the DOMAINS dict in prepare_corpus.py.
const DOMAIN_LABELS = {
  webdev: "Web Development",
  datasci: "Data Science",
  ml: "AI / Machine Learning",
};

let corpusById = {};

// In-memory feedback + profile state, keyed by learnerId.
// Resets on server restart — fine for a demo, not meant to survive it.
// Shape: { [learnerId]: { completed: Set<itemId>, struggled: Set<itemId>,
//                          knownSkills: string[], priorExperience: string, level: string } }
const learnerState = {};

function getLearnerState(learnerId) {
  if (!learnerState[learnerId]) {
    learnerState[learnerId] = {
      completed: new Set(),
      struggled: new Set(),
      knownSkills: [],
      priorExperience: "",
      level: "",
    };
  }
  return learnerState[learnerId];
}

// Merges newly-submitted profile fields into a learner's stored state
// without wiping out anything captured in an earlier call.
function mergeProfile(state, { knownSkills, priorExperience, level }) {
  if (Array.isArray(knownSkills) && knownSkills.length) {
    state.knownSkills = Array.from(new Set([...state.knownSkills, ...knownSkills]));
  }
  if (typeof priorExperience === "string" && priorExperience.trim()) {
    state.priorExperience = priorExperience.trim();
  }
  if (typeof level === "string" && level.trim()) {
    state.level = level.trim();
  }
}

function loadCorpus() {
  const raw = fs.readFileSync(CORPUS_PATH, "utf-8");
  const items = JSON.parse(raw);
  corpusById = {};
  for (const item of items) {
    corpusById[item.id] = {
      ...item,
      prerequisites: (item.prerequisites || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  console.log(`Loaded ${items.length} corpus items for path planning.`);
}

/**
 * Given a set of "target" course ids, walk their prerequisite chains
 * and return the full set of ids needed (targets + all ancestors).
 */
function expandWithPrerequisites(targetIds) {
  const visited = new Set();

  function visit(id) {
    if (visited.has(id)) return;
    if (!corpusById[id]) return; // unknown id, skip defensively
    visited.add(id);
    for (const prereqId of corpusById[id].prerequisites) {
      visit(prereqId);
    }
  }

  for (const id of targetIds) visit(id);
  return Array.from(visited);
}

/**
 * Topological sort (Kahn's algorithm) over the expanded id set,
 * respecting each item's prerequisites.
 */
function topoSort(ids) {
  const idSet = new Set(ids);
  const inDegree = {};
  const adjacency = {}; // prereqId -> [dependentIds]

  for (const id of ids) {
    inDegree[id] = 0;
    adjacency[id] = [];
  }

  for (const id of ids) {
    for (const prereqId of corpusById[id].prerequisites) {
      if (!idSet.has(prereqId)) continue; // prereq wasn't in our set (shouldn't happen after expand)
      adjacency[prereqId].push(id);
      inDegree[id] += 1;
    }
  }

  // Start with items that have no prerequisites in this set
  const queue = ids.filter((id) => inDegree[id] === 0);
  const sorted = [];
  const seenInQueue = new Set(queue);

  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);
    for (const dependent of adjacency[current]) {
      inDegree[dependent] -= 1;
      if (inDegree[dependent] === 0 && !seenInQueue.has(dependent)) {
        queue.push(dependent);
        seenInQueue.add(dependent);
      }
    }
  }

  if (sorted.length !== ids.length) {
    // Cycle detected (shouldn't happen with hand-filled prereqs, but
    // fall back gracefully instead of crashing the demo)
    console.warn("Warning: prerequisite cycle detected, appending remaining items unsorted.");
    for (const id of ids) {
      if (!sorted.includes(id)) sorted.push(id);
    }
  }

  return sorted;
}

/**
 * Given the ids a learner is about to be shown, drops Beginner-level items
 * that clearly overlap with skills the learner already told us they know.
 * This is what makes the profiling step actually change the output, instead
 * of just being collected and ignored.
 *
 * @returns {{ keptIds: string[], skippedCount: number }}
 */
function filterAlreadyKnown(ids, knownSkills) {
  if (!knownSkills || knownSkills.length === 0) {
    return { keptIds: ids, skippedCount: 0 };
  }

  const allSkillDefs = getAllSkillOptions();
  const knownDefs = allSkillDefs.filter((s) => knownSkills.includes(s.label) || knownSkills.includes(s.id));

  if (knownDefs.length === 0) {
    return { keptIds: ids, skippedCount: 0 };
  }

  let skippedCount = 0;
  const keptIds = ids.filter((id) => {
    const item = corpusById[id];
    if (!item || item.difficulty !== "Beginner") return true; // only skip beginner overlap
    const haystack = `${item.skills} ${item.name}`;
    const isKnown = knownDefs.some((def) => textMatchesSkill(haystack, def));
    if (isKnown) {
      skippedCount += 1;
      return false;
    }
    return true;
  });

  return { keptIds, skippedCount };
}

/**
 * Builds the skill-growth breakdown shown on the dashboard: for each skill
 * in the learner's domain, is it already known, covered somewhere in their
 * current path, or still a gap?
 */
function buildSkillCoverage(domain, knownSkills, upcomingIds) {
  const skillDefs = getSkillOptions(domain);
  if (skillDefs.length === 0) return [];

  const upcomingText = upcomingIds
    .map((id) => corpusById[id])
    .filter(Boolean)
    .map((item) => `${item.skills} ${item.name}`)
    .join(" | ");

  return skillDefs.map((def) => {
    const alreadyKnown = knownSkills.includes(def.label) || knownSkills.includes(def.id);
    const inUpcomingPath = textMatchesSkill(upcomingText, def);
    let status = "gap";
    if (alreadyKnown) status = "known";
    else if (inUpcomingPath) status = "planned";
    return { id: def.id, label: def.label, status };
  });
}

function groupIntoMilestones(sortedIds) {
  const milestones = [];
  for (let i = 0; i < sortedIds.length; i += ITEMS_PER_MILESTONE) {
    const chunkIds = sortedIds.slice(i, i + ITEMS_PER_MILESTONE);
    milestones.push({
      milestone: milestones.length + 1,
      items: chunkIds.map((id) => ({
        id,
        name: corpusById[id].name,
        difficulty: corpusById[id].difficulty,
        domain: corpusById[id].domain,
      })),
    });
  }
  return milestones;
}

app.post("/path", async (req, res) => {
  try {
    const { query, domain, top_k, learnerId, knownSkills, priorExperience, level } = req.body;
    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const state = learnerId
      ? getLearnerState(learnerId)
      : { completed: new Set(), struggled: new Set(), knownSkills: [], priorExperience: "", level: "" };

    // Fold any newly-submitted profile info (from onboarding) into the
    // learner's stored profile so it keeps informing future /path calls
    // even after this request, e.g. after marking items complete.
    mergeProfile(state, { knownSkills, priorExperience, level });

    // Build a richer query for the ML service so the profile actually
    // changes *which* items come back, not just which ones get filtered
    // out afterwards.
    const profileBits = [];
    if (state.level) profileBits.push(`Self-rated level: ${state.level}.`);
    if (state.knownSkills.length) profileBits.push(`Already comfortable with: ${state.knownSkills.join(", ")}.`);
    if (state.priorExperience) profileBits.push(`Prior experience: ${state.priorExperience}.`);
    const enrichedQuery = profileBits.length ? `${query} ${profileBits.join(" ")}` : query;

    // Ask for a few extra candidates than requested, since some may get
    // filtered out below as "already known" or already completed.
    const requestedTopK = top_k || 8;

    // 1. Get recommendations from the ML service
    const mlResponse = await fetch(ML_SERVICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: enrichedQuery,
        domain: domain || null,
        top_k: requestedTopK + 4,
      }),
    });

    if (!mlResponse.ok) {
      const text = await mlResponse.text();
      return res.status(502).json({ error: "ML service error", details: text });
    }

    const recommendations = await mlResponse.json();
    const targetIds = recommendations.slice(0, requestedTopK).map((r) => r.id);

    // 2. Expand prerequisites
    const fullIdSet = expandWithPrerequisites(targetIds);

    // 3. Topological sort
    let sortedIds = topoSort(fullIdSet);

    // 3b. Drop items the learner has already completed — they don't need
    // to see them again in the path.
    sortedIds = sortedIds.filter((id) => !state.completed.has(id));

    // 3c. Drop beginner items that clearly overlap with skills the learner
    // already told us they have. This is the concrete effect of the
    // onboarding "what do you already know" step.
    const { keptIds, skippedCount } = filterAlreadyKnown(sortedIds, state.knownSkills);
    sortedIds = keptIds;

    // 4. Group into milestones, flagging items the learner previously
    // struggled with so the frontend can surface a "needs revision" note.
    const milestones = groupIntoMilestones(sortedIds).map((m) => ({
      ...m,
      items: m.items.map((item) => ({
        ...item,
        needsRevision: state.struggled.has(item.id),
      })),
    }));

    const domainLabel = DOMAIN_LABELS[domain] || domain || "your chosen field";

    // 5. Skill-growth breakdown: known / planned / gap, per domain skill.
    const skillCoverage = domain ? buildSkillCoverage(domain, state.knownSkills, sortedIds) : [];

    // 6. One paragraph explaining the shape of the whole roadmap — this is
    // the "explain" pillar made visible before opening any single item.
    const pathSummary = await explainPathOverview({
      query,
      domainLabel,
      milestoneCount: milestones.length,
      itemCount: sortedIds.length,
      skippedKnownCount: skippedCount,
      profile: { level: state.level, knownSkills: state.knownSkills, priorExperience: state.priorExperience },
    });

    res.json({
      query,
      recommended_targets: recommendations,
      total_items_in_path: sortedIds.length,
      milestones,
      pathSummary,
      skillCoverage,
      skippedKnownCount: skippedCount,
      profile: { level: state.level, knownSkills: state.knownSkills, priorExperience: state.priorExperience },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error", details: err.message });
  }
});

// The exact skill checklist shown during onboarding for a given domain —
// served from the backend so the frontend never drifts out of sync with
// what /path actually knows how to match against.
app.get("/profile/:learnerId", (req, res) => {
  const state = getLearnerState(req.params.learnerId);

  // Resolve ids to actual course details so the profile page can show
  // real names, not just counts/ids.
  const resolveItems = (idSet) =>
    Array.from(idSet)
      .map((id) => corpusById[id])
      .filter(Boolean)
      .map((item) => ({ id: item.id, name: item.name, domain: item.domain, difficulty: item.difficulty }));

  res.json({
    learnerId: req.params.learnerId,
    level: state.level,
    knownSkills: state.knownSkills,
    priorExperience: state.priorExperience,
    completedItems: resolveItems(state.completed),
    struggledItems: resolveItems(state.struggled),
  });
});

app.get("/skills/:domain", (req, res) => {
  const options = getSkillOptions(req.params.domain);
  res.json({ domain: req.params.domain, skills: options.map((s) => ({ id: s.id, label: s.label })) });
});

app.post("/ask", async (req, res) => {
  try {
    const { query, question, milestoneNames } = req.body;
    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }
    const answer = await answerLearnerQuery({
      query: query || "an unspecified learning goal",
      question,
      milestoneNames: milestoneNames || [],
    });
    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error", details: err.message });
  }
});

app.post("/possibilities", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const domains = Object.keys(DOMAIN_LABELS);

    // Query the ML service once per domain, top match only.
    // Reuses the same /recommend endpoint the full path uses — no new
    // engine, just a narrower, per-domain call.
    const domainResults = await Promise.all(
      domains.map(async (domain) => {
        const mlResponse = await fetch(ML_SERVICE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, domain, top_k: 1 }),
        });

        if (!mlResponse.ok) {
          return { domain, topItem: null, score: 0 };
        }

        const results = await mlResponse.json();
        const top = results[0] || null;
        return { domain, topItem: top, score: top ? top.score : 0 };
      })
    );

    // Rank domains by their top match score, best first.
    domainResults.sort((a, b) => b.score - a.score);

    // Generate one short explanation per domain, in parallel.
    const withExplanations = await Promise.all(
      domainResults.map(async (d) => {
        if (!d.topItem) {
          return {
            domain: d.domain,
            label: DOMAIN_LABELS[d.domain] || d.domain,
            score: 0,
            topItem: null,
            explanation: "Not enough matching data for this direction yet.",
          };
        }
        const explanation = await explainDomainFit(query, DOMAIN_LABELS[d.domain] || d.domain, d.topItem.name, d.score);
        return {
          domain: d.domain,
          label: DOMAIN_LABELS[d.domain] || d.domain,
          score: d.score,
          topItem: { id: d.topItem.id, name: d.topItem.name },
          explanation,
        };
      })
    );

    res.json({ query, possibilities: withExplanations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error", details: err.message });
  }
});

app.post("/feedback", (req, res) => {
  const { learnerId, itemId, status } = req.body;
  if (!learnerId || !itemId || !status) {
    return res.status(400).json({ error: "learnerId, itemId and status are required" });
  }
  if (!["completed", "struggled"].includes(status)) {
    return res.status(400).json({ error: "status must be 'completed' or 'struggled'" });
  }
  if (!corpusById[itemId]) {
    return res.status(400).json({ error: `unknown itemId: ${itemId}` });
  }

  const state = getLearnerState(learnerId);

  if (status === "completed") {
    state.completed.add(itemId);
    state.struggled.delete(itemId); // completing it clears any prior struggle flag
  } else {
    state.struggled.add(itemId);
  }

  res.json({
    learnerId,
    itemId,
    status,
    completed_count: state.completed.size,
    struggled_count: state.struggled.size,
  });
});

app.post("/explain", async (req, res) => {
  try {
    const { query, itemId, learnerId } = req.body;
    if (!query || !itemId || !corpusById[itemId]) {
      return res.status(400).json({ error: "query and a valid itemId are required" });
    }
    const item = corpusById[itemId];
    const prereqNames = item.prerequisites
      .map((id) => corpusById[id]?.name)
      .filter(Boolean);

    const state = learnerId ? getLearnerState(learnerId) : null;
    const profile = state
      ? { level: state.level, knownSkills: state.knownSkills, priorExperience: state.priorExperience }
      : {};

    const explanation = await explainRecommendation(query, item, prereqNames, profile);
    res.json({ itemId, explanation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error", details: err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", corpus_size: Object.keys(corpusById).length });
});

loadCorpus();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Path planner running on http://localhost:${PORT}`);
  console.log(`Make sure the FastAPI ML service is running on ${ML_SERVICE_URL}`);
});