# Testing the Moneo Extension (Supabase Backend)

## 1. Set Supabase keys (required)

The extension needs your Supabase project URL and anon key. **Do not commit real keys to the repo.**

### Option A: Config file (no console – recommended)

1. Copy the template and add your keys:
   ```bash
   cp supabase.config.template.json supabase.config.json
   ```
2. Edit `supabase.config.json`: set `supabase_url` to your project URL and `supabase_anon_key` to your anon key (e.g. `https://xxxx.supabase.co` and `eyJ...`).
3. Load the extension (see step 2). The background script will read `supabase.config.json` on startup and store the keys in Chrome storage. **No console setup needed.**

**Where to get URL and anon key:** Supabase Dashboard → Project Settings → API → **Project URL** and **anon public** key.

**When you deploy the extension (Chrome Web Store or zip):** The repo has no keys. Generate `supabase.config.json` at build time from env vars so the packaged extension includes it. See **DEPLOYMENT.md**.

### Option B: Set via browser console

1. Load the extension in Chrome (see step 2).
2. Open any webpage → **F12** → **Console**.
3. Run (replace with your real values):
   ```javascript
   chrome.storage.local.set({
     supabase_url: 'https://YOUR_PROJECT_REF.supabase.co',
     supabase_anon_key: 'eyJ...your-anon-key...'
   }, () => console.log('Supabase config saved'));
   ```
4. Reload the news article tab (or open a new article).

---

## 2. Load the extension in Chrome

1. Open **Chrome** and go to `chrome://extensions/`.
2. Turn **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select the **Moneo** project folder (the one containing `manifest.json`).
5. Confirm the Moneo extension appears and is enabled.

---

## 3. Deploy Edge Function and secrets (backend)

If you haven’t already:

```bash
cd /path/to/Moneo
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy fact-check
supabase secrets set OPENAI_API_KEY=sk-your-openai-key
supabase secrets set BRAVE_API_KEY=your-brave-search-key
```

Replace `YOUR_PROJECT_REF`, and use your real OpenAI and Brave keys.

---

## 4. Test on a news article

1. Go to a **supported news site**, e.g.:
   - https://www.bbc.com/news
   - https://www.theguardian.com
   - https://www.nytimes.com
2. Open **any article** (not just the homepage).
3. You should see:
   - A **loading indicator** (lighthouse) in the top-right.
   - After **10–60 seconds** (first time), **highlighted claims** (green / yellow / red).
4. Open **DevTools (F12)** → **Console** and check for:
   - `Moneo MVP loaded`
   - `Calling Supabase fact-check function...`
   - `✅ New analysis complete` or `✅ Cache hit - using cached results`
   - `✅ Processed N claims`

---

## 5. Test cache (second visit)

1. **Reload the same article** (or open it in a new tab).
2. The second run should be **much faster** (cache hit).
3. In the console you should see: `✅ Cache hit - using cached results`.

---

## 6. Test the two fixes (classification + claim_cache)

### Classification fix

- Visit an article that produces **multiple claims**.
- In the console, look for Supabase/Edge Function logs (if you have access to function logs).
- **Expected:** Claim classifications (`current_news`, `general_knowledge`, `empirical_fact`) should match the right sentences. If you have a way to inspect the API response (e.g. Network tab → `fact-check` response), check that each `classification` lines up with the correct claim text.

### claim_cache upsert fix

- Run **two different articles** that share at least one **similar or identical** claim sentence.
- Second time, that claim’s classification can come from `claim_cache` (no duplicate OpenAI call for that claim).
- In Supabase **Table Editor** → `claim_cache`, you should see rows with `claim_hash`, `classification`, `expires_at`, and **no duplicate key errors** when the function runs.

---

## 7. Reload after code changes

After changing extension code (e.g. `config.js`, `content-supabase.js`, `supabase.js`):

1. Go to `chrome://extensions/`.
2. Click the **reload** icon on the Moneo extension.
3. **Reload the news article tab** (or open a new article).

After changing the **Edge Function** (`supabase/functions/fact-check/index.ts`):

```bash
supabase functions deploy fact-check
```

Then reload the article; no need to reload the extension.

---

## 8. Troubleshooting

| Issue | What to do |
|--------|------------|
| **"Supabase configuration not found"** | Set `supabase_url` and `supabase_anon_key` in Chrome storage (step 1). Reload the article tab. |
| **No highlights** | Check Console for errors. Confirm the page is an article on a supported site and the Edge Function is deployed and has secrets set. |
| **Function error 500** | Check Supabase Dashboard → Edge Functions → Logs. Ensure `OPENAI_API_KEY` and (if using web search) `BRAVE_API_KEY` are set. |
| **CORS or network errors** | Confirm `host_permissions` in `manifest.json` includes `https://*.supabase.co/*` and you’ve reloaded the extension. |

---

## 9. Quick checklist

- [ ] Supabase URL and anon key set in Chrome storage (or fallback in config).
- [ ] Extension loaded as unpacked.
- [ ] Edge Function deployed; `OPENAI_API_KEY` and `BRAVE_API_KEY` set.
- [ ] Visited a real article on a supported site.
- [ ] Console shows `Moneo MVP loaded` and no red errors.
- [ ] Second visit to same article is fast (cache hit).
