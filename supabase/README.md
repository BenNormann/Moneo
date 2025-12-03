# Moneo Supabase Backend

This directory contains the Supabase backend infrastructure for the Moneo fact-checking extension.

## Structure

```
supabase/
├── config.toml              # Supabase project configuration
├── migrations/               # Database migrations
│   └── 20240101000000_initial_schema.sql
├── functions/               # Edge Functions
│   └── fact-check/
│       └── index.ts          # Main fact-checking endpoint
└── .env.example              # Environment variables template
```

## Setup

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Initialize Supabase (if starting fresh)

```bash
supabase init
```

### 3. Link to your Supabase project

```bash
supabase link --project-ref your-project-ref
```

### 4. Set up environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for Edge Functions)
- `OPENAI_API_KEY` - Your OpenAI API key
- `BRAVE_API_KEY` - Your Brave Search API key (optional)

### 5. Run migrations

```bash
supabase db push
```

### 6. Deploy Edge Functions

```bash
supabase functions deploy fact-check
```

### 7. Set Edge Function secrets

```bash
supabase secrets set OPENAI_API_KEY=sk-your-key
supabase secrets set BRAVE_API_KEY=your-brave-key
```

## Development

### Local Development

Start Supabase locally:

```bash
supabase start
```

This will:
- Start PostgreSQL database
- Start Supabase Studio (http://localhost:54323)
- Start API server (http://localhost:54321)

### Test Edge Function Locally

```bash
supabase functions serve fact-check
```

Then test with:

```bash
curl -X POST http://localhost:54321/functions/v1/fact-check \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html>...</html>",
    "url": "https://example.com/article"
  }'
```

## Database Schema

### `article_cache`
Caches full article analysis results by URL and HTML hash.

### `claim_cache`
Caches individual claim scores for reuse across articles.

## Edge Functions

### `fact-check`
Main endpoint for fact-checking articles.

**Request:**
```json
{
  "html": "<html>...</html>",
  "url": "https://example.com/article",
  "userId": "optional-user-id"
}
```

**Response:**
```json
{
  "success": true,
  "cached": false,
  "claims": [
    {
      "id": "claim_1",
      "claim": "Claim text...",
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
        "web": [...],
        "all": [...]
      }
    }
  ]
}
```

## Next Steps

1. Port claim extraction logic from `src/core/claimExtractor.js`
2. Port classification logic from `src/core/claimClassifier.js`
3. Port scoring logic from `src/core/claimScorer.js`
4. Integrate Brave Search API for web verification
5. Add authentication/authorization
6. Add rate limiting
7. Add job queue for async processing (if needed)

