CREATE TABLE t_p46289391_video_call_app_2.push_subs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_push_subs_user ON t_p46289391_video_call_app_2.push_subs(user_id);

CREATE TABLE t_p46289391_video_call_app_2.app_settings (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE t_p46289391_video_call_app_2.calls ADD COLUMN reoffer TEXT;
ALTER TABLE t_p46289391_video_call_app_2.calls ADD COLUMN reanswer TEXT;
ALTER TABLE t_p46289391_video_call_app_2.calls ADD COLUMN reseq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE t_p46289391_video_call_app_2.calls ADD COLUMN reanswer_seq INTEGER NOT NULL DEFAULT 0;