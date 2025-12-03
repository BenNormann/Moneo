# Moneo Setup Guide

Quick setup guide for the Supabase-backed MVP version.

## ✅ Already Done

- [x] Supabase project created
- [x] Database tables created
- [x] Edge Function deployed
- [x] OpenAI API key set as secret
- [x] Extension configured

## 🚀 Test Your Extension

1. **Load Extension in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `Moneo` folder

2. **Visit a News Article:**
   - Go to BBC, NYT, or The Guardian
   - Open any article

3. **Check Console (F12):**
   - Should see: `Moneo MVP loaded`
   - Should see: `✅ Processed X claims`
   - Check Network tab for request to `supabase.co/functions/v1/fact-check`

4. **Verify Highlights:**
   - Claims should be highlighted (green/yellow/red)
   - Second visit should be faster (cache working)

## 🔒 Security

- **OpenAI API Key**: Stored securely as Supabase secret (encrypted, only accessible to Edge Functions)
- **Extension**: Uses anon key (safe for client-side)
- **No keys in code**: All secrets are in Supabase

## 💾 Backups

Supabase automatically backs up your database:
- **Daily backups** with 7-day retention
- **Point-in-time recovery** available
- Restore via Dashboard → Database → Backups

## 🐛 Troubleshooting

**"Supabase config not found"**
- Check `src/config.js` has your Supabase URL and anon key

**"Function not found"**
- Function is deployed ✅
- Check console for exact error

**"OpenAI API error"**
- Secret is set ✅
- Check OpenAI dashboard for credits

**No claims found**
- Article might be too short
- Check console for extraction errors

## 📝 Quick Commands

```bash
# Deploy function
supabase functions deploy fact-check

# Set secrets
supabase secrets set OPENAI_API_KEY=sk-...

# Check function status
supabase functions list

# View backups
supabase db backups list
```

## 🎯 Architecture

```
Extension → Sends HTML to Supabase Edge Function
  ↓
Edge Function → Extracts claims → Classifies → Scores
  ↓
Returns results → Extension highlights claims
```

All processing happens on Supabase (not in browser).

