# Secrets and environment variables

Where secrets live and how they are used so nothing is committed and env vars are used where possible.

---

## Summary

| Component | Where secrets come from | Uses env vars? |
|-----------|-------------------------|----------------|
| **GitHub Actions / CI** | Repository Secrets | ✅ Yes – `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| **scripts/prepare-release.js** | `process.env` | ✅ Yes – same as above (set in CI or shell) |
| **Supabase Edge Function** | Supabase secrets (Dashboard or CLI) | ✅ Yes – `Deno.env.get(...)` for OPENAI_API_KEY, BRAVE_API_KEY, etc. |
| **Extension at runtime** | Config files or Chrome storage | ⚠️ No – browser cannot read `process.env`; config is filled from env at **build time** |

---

## 1. CI / build (environment variables)

**Used by:** GitHub Actions, `npm run prepare-release` (local or CI).

**Variables:**

- `SUPABASE_URL` – Supabase project URL (e.g. `https://xxxx.supabase.co`)
- `SUPABASE_ANON_KEY` – Supabase anon/public JWT

**How:**

- **GitHub Actions:** Set in repo **Settings → Secrets and variables → Actions**. Workflow passes them as `env` into the job; `prepare-release` reads `process.env` and writes `supabase.config.json` (so the built extension gets config without hardcoding keys).
- **Local:** Export in shell or use a `.env` file (e.g. `source .env` then `npm run prepare-release`). Do not commit `.env`; use `.env.example` as a template.

**Files:** `.env.example` documents the variables. `.env` and `.env.*` are in `.gitignore`.

---

## 2. Supabase Edge Function (environment variables)

**Used by:** `supabase/functions/fact-check/index.ts` (runs on Supabase, not in the browser).

**Variables (set via Supabase):**

- `SUPABASE_URL` – Injected by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` – Injected by Supabase
- `OPENAI_API_KEY` – Set by you: `supabase secrets set OPENAI_API_KEY=sk-...`
- `BRAVE_API_KEY` – Set by you: `supabase secrets set BRAVE_API_KEY=...`

**How:** The function uses `Deno.env.get("OPENAI_API_KEY")` etc. Supabase injects these from project env/secrets; they are never in code or in the repo.

---

## 3. Extension at runtime (no process.env)

The extension runs in the browser, so it **cannot** read `process.env`. Secrets reach it in one of two ways:

**A. Supabase (current path)**  
- **Build time:** CI or local run of `prepare-release` uses env vars to write `supabase.config.json` into the extension directory.  
- **Runtime:** Background script fetches `supabase.config.json` from the extension and writes `supabase_url` and `supabase_anon_key` into Chrome storage. Content script and Supabase client read from Chrome storage.  
- So env vars are used **only at build time**; at runtime the extension uses the generated config file and then Chrome storage.

**B. Legacy OpenAI path (content.js / in-browser pipeline)**  
- **Local dev:** You create `secrets.json` (from template) with `openai_api_key`. Background script loads it and stores in Chrome storage.  
- **Runtime:** `api.js` and `aiScorer.js` read `openai_api_key` from Chrome storage.  
- No env vars here; this path uses a gitignored file and Chrome storage only.

**Files:**  
- `supabase.config.json` – Generated from env by `prepare-release`, gitignored.  
- `secrets.json` – Optional, for legacy OpenAI path, gitignored.  
- `src/config.js` – Only non-secret config (empty strings for keys); real keys never committed.

---

## 4. Checklist: no secrets in repo

- [ ] `.env` and `.env.*` are in `.gitignore` (only `.env.example` is committed).
- [ ] `secrets.json` and `supabase.config.json` are in `.gitignore`.
- [ ] `src/config.js` has no real keys (empty string or placeholder).
- [ ] CI uses GitHub Secrets for `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- [ ] Supabase Edge Function uses Supabase secrets for `OPENAI_API_KEY` and `BRAVE_API_KEY` (set via Dashboard or `supabase secrets set`).

---

## 5. Quick reference

**Local dev – Supabase path:**  
1. Copy `supabase.config.template.json` to `supabase.config.json`.  
2. Put your Supabase URL and anon key in `supabase.config.json`.  
3. Load the extension; background script will read the file and fill Chrome storage.

**Local dev – optional .env for build:**  
1. Copy `.env.example` to `.env`.  
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`.  
3. Run `npm run prepare-release` (e.g. after `source .env` or using a tool that loads `.env`).

**CI:**  
Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repository secrets; the workflow runs `prepare-release` and packages the extension with the generated config.

**Supabase Edge Function:**  
Set `OPENAI_API_KEY` and `BRAVE_API_KEY` with `supabase secrets set ...`; the function reads them via `Deno.env.get(...)`.
