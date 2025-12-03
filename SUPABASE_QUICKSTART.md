# Supabase Quick Start

Get Moneo running with Supabase backend in 5 minutes.

## Prerequisites

- Node.js installed
- Supabase account (free tier works)
- OpenAI API key
- Brave Search API key (optional, for web verification)

## Step 1: Install Supabase CLI

```bash
npm install -g supabase
```

## Step 2: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Fill in:
   - Name: `moneo`
   - Database Password: (save this!)
   - Region: Choose closest to you
4. Wait ~2 minutes for project to provision

## Step 3: Get Your Keys

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public** key
   - **service_role** key (keep secret!)

## Step 4: Link Local Project

```bash
cd /Users/reganjia/Projects/Moneo/Moneo
supabase link --project-ref your-project-ref
```

Find your project ref in the Supabase dashboard URL: `https://app.supabase.com/project/xxxxx`

## Step 5: Run Database Migrations

```bash
supabase db push
```

This creates the cache tables.

## Step 6: Deploy Edge Function

```bash
supabase functions deploy fact-check
```

## Step 7: Set Secrets

```bash
supabase secrets set OPENAI_API_KEY=sk-your-openai-key
supabase secrets set BRAVE_API_KEY=your-brave-key
```

## Step 8: Update Extension

### Option A: Update manifest.json

Replace `manifest.json` with `manifest-supabase.json`:

```bash
cp manifest-supabase.json manifest.json
```

### Option B: Configure in extension

Add Supabase settings to your popup, or set in `src/config.js`:

```javascript
supabase: {
  url: 'https://your-project.supabase.co',
  anonKey: 'your-anon-key'
}
```

## Step 9: Test

1. Load extension in Chrome (`chrome://extensions/`)
2. Visit a news article
3. Check console for logs
4. Verify highlights appear

## Troubleshooting

### "Function not found"
- Check function is deployed: `supabase functions list`
- Verify project is linked: `supabase projects list`

### "CORS error"
- Edge Function includes CORS headers
- Check Supabase project settings allow your domain

### "OpenAI API error"
- Verify secret is set: `supabase secrets list`
- Check OpenAI API key is valid

### "Supabase configuration not found"
- Set Supabase URL and Anon Key in extension
- Check Chrome storage in DevTools

## Next Steps

1. Port claim extraction logic to Edge Function
2. Port classification logic
3. Port scoring logic
4. Test with real articles
5. Monitor usage in Supabase dashboard

## Local Development

Test locally before deploying:

```bash
# Start Supabase locally
supabase start

# Serve Edge Function locally
supabase functions serve fact-check

# Test
curl -X POST http://localhost:54321/functions/v1/fact-check \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"html": "<p>Test</p>", "url": "https://test.com"}'
```

## Cost Estimate

**Supabase Free Tier:**
- 500MB database
- 2GB bandwidth
- 2 million Edge Function invocations/month

**OpenAI:**
- ~$0.01-0.05 per article (same as before)

**Brave Search:**
- Free tier: 2,000 queries/month
- Paid: $3/1,000 queries after

**Total:** ~$0.01-0.05 per article + Supabase free tier

