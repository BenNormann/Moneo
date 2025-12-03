-- Add cache_version column to article_cache for cache invalidation
-- When we change the cache format (e.g., add bias to sources), increment version to invalidate old cache

ALTER TABLE article_cache 
ADD COLUMN IF NOT EXISTS cache_version INTEGER DEFAULT 1;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_article_cache_version ON article_cache(cache_version);

