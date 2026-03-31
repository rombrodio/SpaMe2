-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- Required for exclusion constraints on uuid + tsrange
