CREATE TABLE t_p46289391_video_call_app_2.gchats (
  id SERIAL PRIMARY KEY,
  title VARCHAR(80) NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_p46289391_video_call_app_2.gchat_members (
  gchat_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.gchats(id),
  user_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gchat_id, user_id)
);
CREATE INDEX idx_gchat_members_user ON t_p46289391_video_call_app_2.gchat_members(user_id) WHERE active;

CREATE TABLE t_p46289391_video_call_app_2.gchat_messages (
  id SERIAL PRIMARY KEY,
  gchat_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.gchats(id),
  sender_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  sender_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_gchat_messages_chat ON t_p46289391_video_call_app_2.gchat_messages(gchat_id, id);

CREATE TABLE t_p46289391_video_call_app_2.gchat_deliveries (
  message_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.gchat_messages(id),
  user_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  cipher TEXT,
  iv VARCHAR(32),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX idx_gchat_deliveries_pending ON t_p46289391_video_call_app_2.gchat_deliveries(user_id) WHERE delivered_at IS NULL;
CREATE INDEX idx_gchat_deliveries_unread ON t_p46289391_video_call_app_2.gchat_deliveries(user_id, message_id) WHERE read_at IS NULL;