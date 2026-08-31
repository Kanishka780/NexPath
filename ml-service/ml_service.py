"""
ml_service.py — NexPath recommender microservice (TF-IDF, fully local)

Run:
    pip install -r requirements.txt
    python ml_service.py

Then POST to http://localhost:8000/recommend
    {"query": "I want to become a frontend developer, I know some HTML/CSS"}

On startup it loads cleaned_corpus.json and fits a TF-IDF vectorizer over
every course's skills+description, entirely in-process — no external API
calls, no rate limits, no network dependency at request time.

NOTE: this replaces the earlier Gemini-embedding-API approach. That
version hit the free-tier rate limit repeatedly during testing (429s
even with exponential backoff), which is a hard blocker for a live demo.
TF-IDF trades semantic depth (it matches on weighted keyword overlap
rather than deep meaning) for total reliability: it's instant, fits
comfortably in Render's 512MB free tier, and can never rate-limit or
go down due to a third-party quota. Given the deadline, reliability
wins. Swap back to the embedding version later if there's time and a
higher API quota.
"""

import json
import os
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

CORPUS_PATH = "cleaned_corpus.json"

app = FastAPI(title="NexPath Recommender")

corpus = []
vectorizer = None
corpus_matrix = None


class RecommendRequest(BaseModel):
    query: str
    domain: Optional[str] = None
    top_k: int = 8


class RecommendResult(BaseModel):
    id: str
    name: str
    domain: str
    difficulty: str
    score: float
    prerequisites: List[str]


@app.on_event("startup")
def load_corpus_and_fit():
    global corpus, vectorizer, corpus_matrix

    if not os.path.exists(CORPUS_PATH):
        raise RuntimeError(
            f"Couldn't find {CORPUS_PATH}. Copy your cleaned_corpus.json "
            f"into this same folder before starting the service."
        )

    with open(CORPUS_PATH, "r", encoding="utf-8") as f:
        corpus = json.load(f)

    texts = [f"{c['name']}. Skills: {c['skills']}. {c['description']}" for c in corpus]

    print(f"Fitting TF-IDF over {len(texts)} corpus items (local, no API calls)...")
    vectorizer = TfidfVectorizer(stop_words="english", max_features=5000)
    corpus_matrix = vectorizer.fit_transform(texts)
    print("Ready.")


@app.get("/health")
def health():
    return {"status": "ok", "corpus_size": len(corpus)}


@app.post("/recommend", response_model=List[RecommendResult])
def recommend(req: RecommendRequest):
    query_vec = vectorizer.transform([req.query])
    sims = cosine_similarity(query_vec, corpus_matrix)[0]

    ranked_idx = sims.argsort()[::-1]

    results = []
    for idx in ranked_idx:
        item = corpus[idx]
        if req.domain and item["domain"] != req.domain:
            continue
        prereqs = [p.strip() for p in item.get("prerequisites", "").split(",") if p.strip()]
        results.append(RecommendResult(
            id=item["id"],
            name=item["name"],
            domain=item["domain"],
            difficulty=item.get("difficulty", "unknown"),
            score=round(float(sims[idx]), 4),
            prerequisites=prereqs,
        ))
        if len(results) >= req.top_k:
            break

    return results


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))