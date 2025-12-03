-- MVP: Minimal database schema for Moneo
-- Lean startup approach - simplest schema that works

-- Simple article cache (stores full results)
CREATE TABLE IF NOT EXISTS article_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url_hash TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  html_hash TEXT NOT NULL,
  claims JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_article_cache_url_hash ON article_cache(url_hash);
CREATE INDEX IF NOT EXISTS idx_article_cache_expires_at ON article_cache(expires_at);

-- Simple claim cache (for future use - MVP doesn't use this yet)
CREATE TABLE IF NOT EXISTS claim_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_hash TEXT UNIQUE NOT NULL,
  claim_text TEXT NOT NULL,
  classification TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claim_cache_claim_hash ON claim_cache(claim_hash);

-- Cleanup function (optional - can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM article_cache WHERE expires_at < NOW();
  DELETE FROM claim_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
