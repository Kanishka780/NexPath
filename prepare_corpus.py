import pandas as pd
import re
import json
import sys
import os
 
# ---------------------------------------------------------------------------
# EDIT THIS SECTION
# ---------------------------------------------------------------------------
 
RAW_CSV_PATH = "raw_courses.csv"
 
DOMAINS = {
    "webdev": ["web development", "html", "css", "javascript", "react", "node", "frontend", "backend", "full stack"],
    "datasci": ["data science", "data analysis", "pandas", "numpy", "statistics", "sql", "data visualization"],
    "ml": ["machine learning", "deep learning", "neural network", "tensorflow", "pytorch", "nlp", "computer vision"],
}
 
MAX_PER_DOMAIN = 40
 
# ---------------------------------------------------------------------------
# You shouldn't need to edit below this line
# ---------------------------------------------------------------------------
 
CANDIDATE_NAME_COLS = ["Course Name", "course_name", "Name", "name", "Title", "title"]
CANDIDATE_SKILL_COLS = ["Skills", "skills", "Course Skills", "SkillsCovered"]
CANDIDATE_DESC_COLS = ["Course Description", "course_description", "Description", "description"]
CANDIDATE_DIFF_COLS = ["Difficulty Level", "Difficulty", "difficulty", "Level", "level"]
 
 
def find_col(df, candidates):
    for c in candidates:
        if c in df.columns:
            return c
    return None
 
 
def clean_text(x):
    if pd.isna(x) or str(x).strip().lower() == "nan":
        return ""
    x = str(x)
    x = re.sub(r"\s+", " ", x).strip()
    return x
 
 
def matches_domain(text, keywords):
    text_lower = text.lower()
    return any(kw in text_lower for kw in keywords)
 
 
def main():
    if not os.path.exists(RAW_CSV_PATH):
        print(f"ERROR: couldn't find '{RAW_CSV_PATH}'.")
        print("Download a Kaggle Coursera dataset CSV and save it with that name")
        print("in the same folder as this script, or edit RAW_CSV_PATH.")
        sys.exit(1)
 
    df = pd.read_csv(RAW_CSV_PATH)
    print(f"Loaded {len(df)} rows from {RAW_CSV_PATH}")
    print(f"Columns found: {list(df.columns)}\n")
 
    name_col = find_col(df, CANDIDATE_NAME_COLS)
    skill_col = find_col(df, CANDIDATE_SKILL_COLS)
    desc_col = find_col(df, CANDIDATE_DESC_COLS)
    diff_col = find_col(df, CANDIDATE_DIFF_COLS)
 
    if not name_col:
        print("ERROR: couldn't find a course-name column. Open the CSV and check")
        print(f"the header row, then add it to CANDIDATE_NAME_COLS. Columns seen: {list(df.columns)}")
        sys.exit(1)
 
    print(f"Using columns -> name: '{name_col}', skills: '{skill_col}', "
          f"description: '{desc_col}', difficulty: '{diff_col}'\n")
 
    rows_out = []
    counters = {d: 0 for d in DOMAINS}
 
    for _, row in df.iterrows():
        name = clean_text(row.get(name_col, ""))
        skills = clean_text(row.get(skill_col, "")) if skill_col else ""
        desc = clean_text(row.get(desc_col, "")) if desc_col else ""
        difficulty = clean_text(row.get(diff_col, "")) if diff_col else ""
 
        if not name:
            continue
 
        search_text = " ".join([name, skills, desc])
 
        matched_domain = None
        for domain, keywords in DOMAINS.items():
            if matches_domain(search_text, keywords):
                matched_domain = domain
                break
 
        if not matched_domain:
            continue
        if counters[matched_domain] >= MAX_PER_DOMAIN:
            continue
 
        counters[matched_domain] += 1
        course_id = f"{matched_domain}-{counters[matched_domain]:03d}"
 
        rows_out.append({
            "id": course_id,
            "domain": matched_domain,
            "name": name,
            "skills": skills,
            "description": desc,
            "difficulty": difficulty if difficulty else "unknown",
            "prerequisites": "",
        })
 
    if not rows_out:
        print("No rows matched any domain. Check your DOMAINS keywords against")
        print("the actual skills/description text in your CSV and adjust them.")
        sys.exit(1)
 
    out_df = pd.DataFrame(rows_out)
    out_df.to_csv("cleaned_corpus.csv", index=False)
 
    with open("cleaned_corpus.json", "w", encoding="utf-8") as f:
        json.dump(rows_out, f, indent=2, ensure_ascii=False)
 
    print("Done.")
    for d, count in counters.items():
        print(f"  {d}: {count} rows")
    print(f"\nWrote cleaned_corpus.csv and cleaned_corpus.json ({len(rows_out)} total rows)")
    print("Next: open cleaned_corpus.csv and hand-fill the 'prerequisites' column")
    print("using the 'id' values from this same file, comma-separated.")
 
 
if __name__ == "__main__":
    main()
 