-- User metrics tracking schema (for future use)
-- This allows tracking user behavior, article views, claim interactions, etc.

-- User sessions (anonymous tracking via extension install ID)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL, -- Extension install ID or browser fingerprint
  first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_articles_viewed INTEGER DEFAULT 0,
  total_claims_viewed INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_active ON user_sessions(last_active);

-- Article views (track which articles users view)
CREATE TABLE IF NOT EXISTS article_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  claims_count INTEGER,
  cache_hit BOOLEAN DEFAULT false, -- Was this served from cache?
  processing_time_ms INTEGER, -- How long did processing take?
  FOREIGN KEY (session_id) REFERENCES user_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_article_views_session_id ON article_views(session_id);
CREATE INDEX IF NOT EXISTS idx_article_views_url_hash ON article_views(url_hash);
CREATE INDEX IF NOT EXISTS idx_article_views_viewed_at ON article_views(viewed_at);

-- Claim interactions (track which claims users click on)
CREATE TABLE IF NOT EXISTS claim_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  claim_hash TEXT NOT NULL,
  trust_score DECIMAL(3,1),
  interaction_type TEXT NOT NULL, -- 'click', 'hover', 'source_click'
  source_url TEXT, -- If user clicked a source link
  interacted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (session_id) REFERENCES user_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_claim_interactions_session_id ON claim_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_claim_interactions_claim_hash ON claim_interactions(claim_hash);
CREATE INDEX IF NOT EXISTS idx_claim_interactions_interacted_at ON claim_interactions(interacted_at);

-- Daily metrics summary (for analytics dashboard)
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  total_articles_viewed INTEGER DEFAULT 0,
  total_claims_viewed INTEGER DEFAULT 0,
  total_cache_hits INTEGER DEFAULT 0,
  total_cache_misses INTEGER DEFAULT 0,
  avg_processing_time_ms INTEGER,
  unique_users INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(date);

