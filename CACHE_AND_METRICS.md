# Cache & Metrics Documentation

## Current Caching System

### ✅ Caching is Stored in PostgreSQL (Supabase)

All caching uses Supabase's PostgreSQL database:

1. **Article Cache** (`article_cache` table)
   - Caches complete fact-check results for entire articles
   - Key: `url_hash` (URL only, not HTML hash - HTML changes with ads/tracking)
   - Stores: Full claims array with all scores, sources, bias info
   - Expires: 24 hours
   - **Location**: PostgreSQL via `supabase.from("article_cache")`

2. **Claim Cache** (`claim_cache` table)
   - Caches OpenAI classification results for individual claims
   - Key: `claim_hash` (SHA-256 of claim text)
   - Stores: Classification (current_news, general_knowledge, empirical_fact)
   - Expires: 24 hours
   - **Location**: PostgreSQL via `supabase.from("claim_cache")`

### How It Works

```typescript
// Article cache check (in Edge Function)
const { data: cached } = await supabase
  .from("article_cache")
  .select("claims, cache_version")
  .eq("url_hash", urlHash)
  .gt("expires_at", new Date().toISOString())
  .single();

if (cached) {
  return cached.claims; // Instant return, 0 API calls
}
```

## Web Source Accuracy

### Current Implementation

**Search Query**: We use the full claim text as the search query, which can be:
- ✅ Good: Captures full context
- ❌ Problem: May be too long (truncated to 200-330 chars)
- ❌ Problem: Includes filler words that reduce relevance

### ✅ Improvement Added

New `extractKeySearchTerms()` function:
- Extracts capitalized entities (names, places, organizations)
- Extracts numbers with context (statistics, dates)
- Combines key terms + first 150 chars of claim
- **Result**: More focused, relevant search queries

**Example**:
- Before: `"According to the Axios news site, Trump has treated Benjamin Netanyahu..."` (full claim)
- After: `"Trump Benjamin Netanyahu According to the Axios news site, Trump has treated..."` (key terms + context)

### Source Relevance

Brave Search API returns results ranked by relevance. We:
1. Filter out the article's own domain (to avoid self-referencing)
2. Classify sources by political bias (left/center/right)
3. Return top 15 results with title, snippet, URL, and bias

**Accuracy**: Generally good, but depends on:
- Claim clarity (improved with key term extraction)
- Brave Search's ranking algorithm
- Domain filtering (excludes article's own domain)

## Clearing Cache

### Clear All Cache

Run this migration to clear all cached data:

```bash
cd /Users/reganjia/Projects/Moneo/Moneo
supabase db push
```

Or manually in Supabase SQL Editor:

```sql
-- Clear article cache
TRUNCATE TABLE article_cache CASCADE;

-- Clear claim cache  
TRUNCATE TABLE claim_cache CASCADE;
```

### Verify Cache is Empty

```sql
SELECT COUNT(*) as article_cache_count FROM article_cache;
SELECT COUNT(*) as claim_cache_count FROM claim_cache;
```

## User Metrics Tracking (Future)

### Schema Created

I've created a user metrics schema (`20241203000002_user_metrics_schema.sql`) with:

1. **`user_sessions`** - Track anonymous users (via extension install ID)
2. **`article_views`** - Track which articles users view
3. **`claim_interactions`** - Track which claims users click/hover
4. **`daily_metrics`** - Summary stats for analytics dashboard

### How to Enable Metrics

**Step 1**: Generate session ID in extension
```javascript
// In content-supabase.js or background.js
const sessionId = await chrome.storage.local.get('sessionId') || 
                  await chrome.storage.local.set({ sessionId: generateUUID() });
```

**Step 2**: Send metrics to Edge Function
```typescript
// In Edge Function
await supabase.from("article_views").insert({
  session_id: sessionId,
  url: url,
  url_hash: urlHash,
  claims_count: claims.length,
  cache_hit: !!cached,
  processing_time_ms: Date.now() - startTime
});
```

**Step 3**: Track claim interactions
```javascript
// In highlighter.js when user clicks claim
await fetch(`${SUPABASE_URL}/functions/v1/track-interaction`, {
  method: 'POST',
  body: JSON.stringify({
    session_id: sessionId,
    claim_hash: claimHash,
    interaction_type: 'click',
    trust_score: claim.trustScore
  })
});
```

### Metrics You Can Track

- **User Engagement**: Articles viewed, claims clicked, sources clicked
- **Performance**: Cache hit rate, processing time
- **Content Analysis**: Most viewed articles, most clicked claims
- **User Behavior**: Trust score distribution, bias preferences

### Privacy

- Uses anonymous session IDs (no PII)
- No user accounts required
- Can be GDPR-compliant with proper disclosure

## What's Actually Used

### ✅ Currently Used

1. **`article_cache`** - ✅ Active, stores full results
2. **`claim_cache`** - ✅ Active, stores classifications
3. **Cache versioning** - ✅ Active, invalidates old cache

### 📋 Future Use (Not Yet Implemented)

1. **`user_sessions`** - Schema ready, not implemented
2. **`article_views`** - Schema ready, not implemented
3. **`claim_interactions`** - Schema ready, not implemented
4. **`daily_metrics`** - Schema ready, not implemented

## Recommendations

1. ✅ **Caching is working** - Uses PostgreSQL via Supabase
2. ✅ **Web search improved** - Better query extraction for relevance
3. ✅ **Cache cleared** - Fresh start with new improvements
4. 📋 **Metrics ready** - Schema created, easy to enable when needed

