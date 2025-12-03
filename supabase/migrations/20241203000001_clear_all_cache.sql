-- Clear all cache tables to start fresh
-- Run this if you want to reset all cached data

-- Clear article cache
TRUNCATE TABLE article_cache CASCADE;

-- Clear claim cache  
TRUNCATE TABLE claim_cache CASCADE;

-- Verify tables are empty
SELECT COUNT(*) as article_cache_count FROM article_cache;
SELECT COUNT(*) as claim_cache_count FROM claim_cache;

