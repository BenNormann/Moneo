# Fact-Check Edge Function

This Edge Function handles the complete fact-checking pipeline for Moneo.

## Endpoint

`POST /functions/v1/fact-check`

## Request

```json
{
  "html": "<html>...</html>",
  "url": "https://example.com/article",
  "userId": "optional-user-id"
}
```

## Response

```json
{
  "success": true,
  "cached": false,
  "claims": [
    {
      "id": "claim_1",
      "claim": "Claim text here...",
      "classification": "current_news",
      "scores": {
        "aiRating": 7.5,
        "toneAnalysis": 8.0,
        "scholarlyMatch": 0,
        "webReinforced": 6.5
      },
      "trustScore": 7.2,
      "sources": {
        "scholar": [],
        "web": [
          {
            "url": "https://...",
            "title": "...",
            "domain": "..."
          }
        ],
        "all": [...]
      }
    }
  ]
}
```

## Flow

1. Check cache (by URL + HTML hash)
2. If cached, return cached results
3. If not cached:
   - Extract article text from HTML
   - Extract claims (0-50)
   - Classify claims (OpenAI)
   - Score claims (OpenAI + Scholar + Brave Search)
   - Cache results
   - Return results

## Environment Variables

Required secrets:
- `OPENAI_API_KEY` - OpenAI API key for classification and scoring
- `BRAVE_API_KEY` - Brave Search API key for web verification (optional)

Set with:
```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set BRAVE_API_KEY=...
```

## TODO

- [ ] Port claim extraction logic from `src/core/claimExtractor.js`
- [ ] Port classification logic from `src/core/claimClassifier.js`
- [ ] Port scoring logic from `src/core/claimScorer.js`
- [ ] Integrate Brave Search API
- [ ] Add error handling and retries
- [ ] Add rate limiting
- [ ] Add logging/monitoring

