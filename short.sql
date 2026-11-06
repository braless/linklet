DROP TABLE IF EXISTS links;
CREATE TABLE IF NOT EXISTS links (
  `id` integer PRIMARY KEY NOT NULL,
  `url` text,
  `slug` text,
  `ua` text,
  `ip` text,
  `status` int,
  `create_time` DATE
);
DROP TABLE IF EXISTS logs;
CREATE TABLE IF NOT EXISTS logs (
  `id` integer PRIMARY KEY NOT NULL,
  `url` text ,
  `slug` text,
  `referer` text,
  `ua` text ,
  `ip` text ,
  `create_time` DATE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_links_slug ON links (slug);
CREATE INDEX IF NOT EXISTS idx_links_url ON links (url);
CREATE INDEX IF NOT EXISTS idx_links_status ON links (status);
CREATE INDEX IF NOT EXISTS idx_logs_slug ON logs (slug);


