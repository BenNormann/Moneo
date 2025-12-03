# Article Cache vs Claim Cache - Explained

## The Key Difference

**Article Cache** = Complete results for an entire article (the "big picture")
**Claim Cache** = Just the classification for individual claims (a "micro" optimization)

---

## Example Scenario

Let's say you visit this BBC article:
**URL**: `https://www.bbc.com/news/article-123`

The article contains these 3 claims:
1. "Trump visited the White House in 2024"
2. "The sky is blue"
3. "Biden won the 2020 election"

---

## Article Cache (The Big Picture)

### What It Stores
**Key**: Article URL (`https://www.bbc.com/news/article-123`)
**Value**: Complete fact-check results for ALL claims in that article

```json
{
  "url": "https://www.bbc.com/news/article-123",
  "claims": [
    {
      "claim": "Trump visited the White House in 2024",
      "classification": "current_news",
      "trustScore": 7.5,
      "aiRating": 8.0,
      "toneAnalysis": 6.5,
      "sources": {
        "web": [
          { "url": "https://cnn.com/...", "title": "...", "bias": "left" },
          { "url": "https://reuters.com/...", "title": "...", "bias": "center" }
        ],
        "scholar": [...]
      }
    },
    {
      "claim": "The sky is blue",
      "classification": "general_knowledge",
      "trustScore": 9.5,
      ...
    },
    {
      "claim": "Biden won the 2020 election",
      "classification": "empirical_fact",
      "trustScore": 10.0,
      ...
    }
  ]
}
```

### When It's Used
- **First visit**: Process everything (expensive - 30+ API calls)
- **Second visit** (same URL): Return cached results instantly (0 API calls)

### Benefit
Saves **ALL** expensive operations:
- ✅ No OpenAI classification calls
- ✅ No OpenAI credibility calls
- ✅ No OpenAI tone calls
- ✅ No Brave API web searches
- ✅ No Scholar scraping

**Result**: Instant return, 0 API calls

---

## Claim Cache (The Micro Optimization)

### What It Stores
**Key**: Claim text hash (e.g., hash of "The sky is blue")
**Value**: Just the classification result

```json
{
  "claim_hash": "abc123...",
  "claim_text": "The sky is blue",
  "classification": "general_knowledge"
}
```

### When It's Used
**During processing** - when we're classifying claims, we check if we've seen this exact claim text before (in ANY article).

### Example Flow

**Scenario**: You visit a NEW article that happens to contain "The sky is blue" again

1. Extract claims from new article
2. For each claim, check `claim_cache`:
   - "Trump visited..." → Not in cache → Call OpenAI → Cache result
   - "The sky is blue" → **Found in cache!** → Skip OpenAI call ✅
   - "Biden won..." → Not in cache → Call OpenAI → Cache result

### Benefit
Saves **ONE** OpenAI classification call per cached claim

**Result**: Slightly faster processing, fewer API calls

---

## Real-World Example

### Visit 1: BBC Article
```
URL: https://www.bbc.com/news/article-123
Claims:
  - "The sky is blue"
  - "Biden won the 2020 election"
```

**Processing**:
1. Check `article_cache` → ❌ MISS (new article)
2. Extract claims
3. Check `claim_cache` for each:
   - "The sky is blue" → ❌ MISS → Call OpenAI → Cache it
   - "Biden won..." → ❌ MISS → Call OpenAI → Cache it
4. Score all claims (OpenAI, Brave, Scholar)
5. **Save to `article_cache`** (complete results)

**API Calls**: ~10+ calls (classification, scoring, web search, etc.)

---

### Visit 2: Same BBC Article (You refresh the page)
```
URL: https://www.bbc.com/news/article-123
```

**Processing**:
1. Check `article_cache` → ✅ **HIT!**
2. Return cached results instantly

**API Calls**: **0** (everything cached!)

---

### Visit 3: Different Article (CNN)
```
URL: https://www.cnn.com/news/article-456
Claims:
  - "The sky is blue" (same claim as before!)
  - "New study shows..."
```

**Processing**:
1. Check `article_cache` → ❌ MISS (different URL)
2. Extract claims
3. Check `claim_cache` for each:
   - "The sky is blue" → ✅ **HIT!** → Skip OpenAI classification ✅
   - "New study..." → ❌ MISS → Call OpenAI → Cache it
4. Score all claims (still need to do this - no article cache)
5. Save to `article_cache`

**API Calls**: ~9 calls (saved 1 classification call thanks to `claim_cache`)

---

## Summary Table

| Cache Type | Key | Value | When Used | Saves |
|------------|-----|-------|-----------|-------|
| **Article Cache** | Article URL | Complete results (all claims, scores, sources) | Same article URL | **ALL** API calls (instant return) |
| **Claim Cache** | Claim text | Just classification | Same claim text (any article) | **ONE** OpenAI classification call |

---

## Why Both?

- **Article Cache**: For speed - instant results when revisiting articles
- **Claim Cache**: For efficiency - saves API calls when the same claim appears in different articles

**Example**: If "Biden won the 2020 election" appears in 100 different articles, `claim_cache` saves 99 OpenAI classification calls!

