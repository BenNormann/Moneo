# GitHub Actions – CI/CD

## Build workflow (`build-extension.yml`)

- **Triggers:** Push to `main`/`master`, or “Run workflow” from the Actions tab.
- **Secrets:** Reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from repository secrets (never logged).
- **Output:** Builds the extension with Supabase config and uploads `moneo-extension.zip` as an artifact.

## Setting repository secrets

1. Open the repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret** and add:

   | Name               | Value |
   |--------------------|--------|
   | `SUPABASE_URL`     | `https://YOUR_PROJECT_REF.supabase.co` |
   | `SUPABASE_ANON_KEY`| Your Supabase anon (public) key (JWT starting with `eyJ...`) |

3. Get the anon key from **Supabase Dashboard** → your project → **Settings** → **API** → **Project API keys** → **anon public**.

Secrets are not shown in logs and are not available to forks.

## Downloading the built extension

1. Go to the **Actions** tab → select the latest “Build extension” run.
2. In the **Artifacts** section, download **moneo-extension**.
3. Unzip and load in Chrome via “Load unpacked” (for testing) or use the zip for Chrome Web Store upload.

## Local use of env vars (optional)

For local builds or running `npm run prepare-release` on your machine:

1. Copy the example file: `cp .env.example .env`
2. Edit `.env` and set `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
3. Run with env loaded, e.g.:
   - `source .env` then `npm run prepare-release` (if your shell exports the vars), or
   - Use a helper like `dotenv` (e.g. `node -r dotenv/config scripts/prepare-release.js`) if you add it.

Do not commit `.env`; it is listed in `.gitignore`.
