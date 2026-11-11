-- Comments people left on the ads, per campaign per day (Meta's "comment" action).
ALTER TABLE meta_ad_insights ADD COLUMN IF NOT EXISTS comments integer NOT NULL DEFAULT 0;
NOTIFY pgrst, 'reload schema';
