# Supabase Migration Guide

This guide explains how to migrate Moneo from client-side processing to Supabase backend.

## Architecture Overview

### Before (Client-Side)
```
Extension → Extract Claims → Classify → Score → Highlight
(All processing happens in browser)
```

### After (Supabase Backend)
```
Extension → Send HTML to Supabase → Edge Function processes → Return results → Highlight
(Processing happens on Supabase Edge Functions)
```

## Setup Steps

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and API keys:
   - Project URL: `https://your-project.supabase.co`
   - Anon Key: Found in Settings → API
   - Service Role Key: Found in Settings → API (keep secret!)

### 2. Set Up Database

Run the migration:

```bash
cd supabase
supabase db push
```

This creates:
- `article_cache` table for caching full article results
- `claim_cache` table for caching individual claim scores

### 3. Deploy Edge Function

```bash
# Deploy the fact-check function
supabase functions deploy fact-check

# Set environment variables (secrets)
supabase secrets set OPENAI_API_KEY=sk-your-key
supabase secrets set BRAVE_API_KEY=your-brave-key
```

### 4. Configure Extension

#### Option A: Via Extension Settings (Recommended)

Add a settings page to your extension popup where users can enter:
- Supabase URL
- Supabase Anon Key

#### Option B: Via Config File

Edit `src/config.js`:

```javascript
supabase: {
  url: 'https://your-project.supabase.co',
  anonKey: 'your-anon-key'
}
```

### 5. Switch to Supabase Manifest

Replace `manifest.json` with `manifest-supabase.json`:

```bash
cp manifest-supabase.json manifest.json
```

Or manually update `manifest.json` to use `content-supabase.js` instead of `content.js`.

## What Changed

### Files Added
- `supabase/` - Supabase backend infrastructure
- `src/utils/supabase.js` - Supabase client for extension
- `src/content-supabase.js` - New content script that calls Supabase
- `manifest-supabase.json` - Manifest for Supabase version

### Files Removed (from content script)
The following are no longer loaded in the browser:
- `src/core/claimExtractor.js` - Moved to Edge Function
- `src/core/claimClassifier.js` - Moved to Edge Function
- `src/core/claimScorer.js` - Moved to Edge Function
- `src/scoring/*.js` - Moved to Edge Function
- `src/scrapers/*.js` - Moved to Edge Function
- `src/utils/api.js` - No longer needed (OpenAI called server-side)
- `src/utils/cache.js` - Replaced by Supabase Postgres cache

### Files Kept
- `src/ui/highlighter.js` - Still needed for DOM highlighting
- `src/ui/tooltip.js` - Still needed for tooltips
- `src/utils/logger.js` - Still useful for debugging

## Next Steps: Port Logic to Edge Function

The Edge Function (`supabase/functions/fact-check/index.ts`) currently has placeholder functions. You need to port:

### 1. Claim Extraction
Port logic from `src/core/claimExtractor.js` to the `extractClaims()` function.

### 2. Classification
Port logic from `src/core/claimClassifier.js` to the `classifyClaims()` function.
- Check `claim_cache` table first
- Call OpenAI if not cached
- Store results in `claim_cache`

### 3. Scoring
Port logic from `src/core/claimScorer.js` to the `scoreClaims()` function.
- Port `AIScorer` for credibility and tone
- Port `ScholarScorer` for empirical facts
- Port `WebScorer` for web verification (use Brave Search API)

### 4. Web Search Migration
Replace DuckDuckGo/Bing scraping with Brave Search API:

```typescript
// In Edge Function
const braveResponse = await fetch(
  `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`,
  {
    headers: {
      'X-Subscription-Token': Deno.env.get('BRAVE_API_KEY')!
    }
  }
);
```

## Testing

### Test Locally

1. Start Supabase locally:
```bash
supabase start
```

2. Serve Edge Function locally:
```bash
supabase functions serve fact-check
```

3. Test the function:
```bash
curl -X POST http://localhost:54321/functions/v1/fact-check \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html><body><p>Test claim here.</p></body></html>",
    "url": "https://example.com/test"
  }'
```

### Test in Extension

1. Load extension in Chrome
2. Configure Supabase credentials
3. Visit a news article
4. Check browser console for logs
5. Verify highlights appear

## Benefits of Supabase Backend

1. **Centralized Processing** - All AI calls happen server-side
2. **Persistent Caching** - Postgres cache survives browser restarts
3. **Rate Limiting** - Can implement per-user rate limits
4. **Cost Control** - Single OpenAI API key, easier to monitor
5. **Scalability** - Edge Functions auto-scale
6. **Security** - API keys never exposed to browser
7. **Analytics** - Can track usage in database

## Troubleshooting

### "Supabase configuration not found"
- Make sure you've set Supabase URL and Anon Key
- Check Chrome storage: `chrome.storage.local.get(['supabase_url', 'supabase_anon_key'])`

### "Function not found" or 404
- Verify Edge Function is deployed: `supabase functions list`
- Check function URL matches your Supabase project URL

### "CORS error"
- Edge Functions should have CORS headers (already included in code)
- Check that your Supabase project allows requests from your domain

### "OpenAI API error"
- Verify `OPENAI_API_KEY` secret is set: `supabase secrets list`
- Check OpenAI API key is valid and has credits

## Migration Checklist

- [ ] Create Supabase project
- [ ] Run database migrations
- [ ] Deploy Edge Function
- [ ] Set environment secrets (OpenAI, Brave)
- [ ] Update extension manifest
- [ ] Configure Supabase credentials in extension
- [ ] Port claim extraction logic
- [ ] Port classification logic
- [ ] Port scoring logic
- [ ] Migrate to Brave Search API
- [ ] Test locally
- [ ] Test in extension
- [ ] Deploy to production

