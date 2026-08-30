/**
 * skillTaxonomy.js — single source of truth for the per-domain skill
 * checklist shown during onboarding, and for matching a learner's
 * self-reported skills against corpus items.
 *
 * Each skill has:
 *   - id / label : shown to the learner
 *   - keywords   : lowercase substrings checked against an item's
 *                  `skills` field and `name` to decide whether that
 *                  item teaches / assumes this skill.
 *
 * Used by:
 *   - GET  /skills/:domain      (frontend onboarding step)
 *   - POST /path                (filtering out items the learner already
 *                                 knows, and building the skill-growth chart)
 */

const DOMAIN_SKILLS = {
  webdev: [
    { id: "html-css", label: "HTML & CSS basics", keywords: ["web design", "html", "css"] },
    { id: "javascript", label: "JavaScript", keywords: ["javascript"] },
    { id: "frontend-frameworks", label: "Front-end frameworks (React/Vue/Angular)", keywords: ["front-end web development"] },
    { id: "backend-apis", label: "Backend & APIs", keywords: ["web development", "software engineering"] },
    { id: "databases", label: "Databases & SQL", keywords: ["sql", "databases", "data management"] },
    { id: "version-control", label: "Git & version control", keywords: ["computer programming"] },
    { id: "cloud-basics", label: "Cloud basics", keywords: ["cloud computing"] },
    { id: "web-tools", label: "Web dev tooling & build tools", keywords: ["web development tools"] },
  ],
  ml: [
    { id: "python", label: "Python programming", keywords: ["python programming"] },
    { id: "stats", label: "Statistics & probability", keywords: ["statistics", "general statistics"] },
    { id: "ml-algos", label: "Core ML algorithms", keywords: ["machine learning algorithms"] },
    { id: "neural-nets", label: "Neural networks", keywords: ["artificial neural networks", "neural network"] },
    { id: "deep-learning", label: "Deep learning", keywords: ["deep learning"] },
    { id: "frameworks", label: "TensorFlow / PyTorch", keywords: ["tensorflow", "machine learning software"] },
    { id: "nlp", label: "NLP basics", keywords: ["natural language processing"] },
    { id: "applied-ml", label: "Applied ML projects", keywords: ["applied machine learning"] },
  ],
  datasci: [
    { id: "python-ds", label: "Python for data", keywords: ["python programming"] },
    { id: "sql", label: "SQL & databases", keywords: ["sql", "databases"] },
    { id: "excel", label: "Excel / spreadsheets", keywords: ["spreadsheet software", "microsoft excel"] },
    { id: "data-viz", label: "Data visualization", keywords: ["data visualization"] },
    { id: "stats-ds", label: "Statistics", keywords: ["general statistics", "statistics"] },
    { id: "data-analysis", label: "Exploratory data analysis", keywords: ["exploratory data analysis", "data analysis"] },
    { id: "cloud-ds", label: "Cloud platforms", keywords: ["cloud computing", "ibm cloud"] },
    { id: "data-mgmt", label: "Data management / ETL", keywords: ["data management", "extract, transform, load"] },
  ],
};

function getSkillOptions(domain) {
  return DOMAIN_SKILLS[domain] || [];
}

// All domains' skills flattened, for when we don't yet know the domain.
function getAllSkillOptions() {
  return Object.values(DOMAIN_SKILLS).flat();
}

function textMatchesSkill(text, skill) {
  const lower = (text || "").toLowerCase();
  return skill.keywords.some((kw) => lower.includes(kw));
}

module.exports = { DOMAIN_SKILLS, getSkillOptions, getAllSkillOptions, textMatchesSkill };
