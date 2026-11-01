ALTER TABLE t_p46289391_video_call_app_2.gchat_messages ADD COLUMN cipher TEXT;
ALTER TABLE t_p46289391_video_call_app_2.gchat_messages ADD COLUMN iv VARCHAR(32);
ALTER TABLE t_p46289391_video_call_app_2.gchat_messages ADD COLUMN silent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE t_p46289391_video_call_app_2.gchat_members ADD COLUMN read_upto INTEGER NOT NULL DEFAULT 0;

CREATE TABLE t_p46289391_video_call_app_2.gchat_keys (
  gchat_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.gchats(id),
  user_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  cipher TEXT NOT NULL,
  iv VARCHAR(32) NOT NULL,
  sender_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gchat_id, user_id)
);