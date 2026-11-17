-- AmigoDocs schema. Every statement is idempotent so it can run on each start.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'es',
  is_helper BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  residence_country TEXT NOT NULL DEFAULT '',
  residence_city TEXT NOT NULL DEFAULT '',
  languages TEXT[] NOT NULL DEFAULT '{}',
  bio TEXT NOT NULL DEFAULT '',
  helper_country TEXT,
  helper_region TEXT NOT NULL DEFAULT '',
  helper_city TEXT NOT NULL DEFAULT '',
  expertise TEXT[] NOT NULL DEFAULT '{}',
  available BOOLEAN NOT NULL DEFAULT TRUE,
  verification TEXT NOT NULL DEFAULT 'none',
  verification_note TEXT NOT NULL DEFAULT '',
  totp_secret TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  seeker_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  urgency TEXT NOT NULL DEFAULT 'normal',
  language TEXT NOT NULL DEFAULT 'es',
  thanks TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  helper_id INT REFERENCES users(id) ON DELETE SET NULL,
  step INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS requests_open_idx ON requests (country, status);
CREATE INDEX IF NOT EXISTS requests_seeker_idx ON requests (seeker_id);

-- A thread is one conversation between the seeker and one helper about one
-- request. It starts as an invitation (from the seeker) or an offer (from the
-- helper) and becomes the working channel once the other side accepts.
CREATE TABLE IF NOT EXISTS threads (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  helper_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initiated_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  seeker_read_at TIMESTAMPTZ,
  helper_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, helper_id)
);
CREATE INDEX IF NOT EXISTS threads_helper_idx ON threads (helper_id);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  thread_id INT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (thread_id, id);

-- File contents are stored encrypted (AES-256-GCM) and removed after expires_at.
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  thread_id INT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  uploader_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INT NOT NULL,
  iv BYTEA NOT NULL,
  tag BYTEA NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS files_thread_idx ON files (thread_id);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  reviewer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS reviews_reviewee_idx ON reviews (reviewee_id);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  reporter_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id INT REFERENCES threads(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS guides (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'es',
  country TEXT,
  doc_type TEXT,
  source_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
