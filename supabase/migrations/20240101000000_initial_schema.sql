-- Initial database schema for Moneo fact-checking extension

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cache table for article analysis results
CREATE TABLE IF NOT EXISTS article_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url_hash TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  html_hash TEXT NOT NULL,
  claims JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_article_cache_url_hash ON article_cache(url_hash);
CREATE INDEX IF NOT EXISTS idx_article_cache_expires_at ON article_cache(expires_at);

-- Cache table for individual claim scores (for reuse across articles)
CREATE TABLE IF NOT EXISTS claim_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_hash TEXT UNIQUE NOT NULL,
  claim_text TEXT NOT NULL,
  classification TEXT,
  scores JSONB NOT NULL,
  sources JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index for claim lookups
CREATE INDEX IF NOT EXISTS idx_claim_cache_claim_hash ON claim_cache(claim_hash);
CREATE INDEX IF NOT EXISTS idx_claim_cache_expires_at ON claim_cache(expires_at);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for article_cache
CREATE TRIGGER update_article_cache_updated_at
  BEFORE UPDATE ON article_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM article_cache WHERE expires_at < NOW();
  DELETE FROM claim_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

