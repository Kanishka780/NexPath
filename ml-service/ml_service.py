"""
ml_service.py — NexPath recommender microservice

Run:
    pip install fastapi uvicorn sentence-transformers scikit-learn numpy
    python ml_service.py

Then POST to http://localhost:8000/recommend
    {"query": "I want to become a frontend developer, I know some HTML/CSS"}

On startup it loads cleaned_corpus.json (put it in the same folder as this
script) and embeds every course's skills+description once, in memory.
No DB needed for a 2-day build.
"""

import json
import os
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

CORPUS_PATH = "cleaned_corpus.json"
MODEL_NAME = "all-MiniLM-L6-v2"  # small, fast, no API key needed

app = FastAPI(title="NexPath Recommender")

model = None
corpus = []
corpus_embeddings = None


class RecommendRequest(BaseModel):
    query: str              # learner's goal/interests, free text
    domain: Optional[str] = None  # optional filter: "webdev" / "datasci" / "ml"
    top_k: int = 8


class RecommendResult(BaseModel):
    id: str
    name: str
    domain: str
    difficulty: str
    score: float
    prerequisites: List[str]


@app.on_event("startup")
def load_model_and_corpus():
    global model, corpus, corpus_embeddings

    print("Loading embedding model...")
    model = SentenceTransformer(MODEL_NAME)

    if not os.path.exists(CORPUS_PATH):
        raise RuntimeError(
            f"Couldn't find {CORPUS_PATH}. Copy your cleaned_corpus.json "
            f"into this same folder before starting the service."
        )

    with open(CORPUS_PATH, "r", encoding="utf-8") as f:
        corpus = json.load(f)

    print(f"Embedding {len(corpus)} corpus items...")
    texts = [f"{c['name']}. Skills: {c['skills']}. {c['description']}" for c in corpus]
    corpus_embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=True)
    print("Ready.")


@app.get("/health")
def health():
    return {"status": "ok", "corpus_size": len(corpus)}


@app.post("/recommend", response_model=List[RecommendResult])
def recommend(req: RecommendRequest):
    query_embedding = model.encode([req.query], convert_to_numpy=True)
    sims = cosine_similarity(query_embedding, corpus_embeddings)[0]

    ranked_idx = np.argsort(sims)[::-1]

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
    uvicorn.run(app, host="0.0.0.0", port=8000)