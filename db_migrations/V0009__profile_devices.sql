ALTER TABLE t_p46289391_video_call_app_2.users ADD COLUMN avatar TEXT;

ALTER TABLE t_p46289391_video_call_app_2.sessions ADD COLUMN id SERIAL;
ALTER TABLE t_p46289391_video_call_app_2.sessions ADD COLUMN device_name VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE t_p46289391_video_call_app_2.sessions ADD COLUMN last_active TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE t_p46289391_video_call_app_2.sessions ADD COLUMN msg_cursor INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_sessions_user ON t_p46289391_video_call_app_2.sessions(user_id);

UPDATE t_p46289391_video_call_app_2.sessions s SET msg_cursor = COALESCE((
  SELECT MAX(m.id) FROM t_p46289391_video_call_app_2.messages m
  JOIN t_p46289391_video_call_app_2.chats c ON c.id = m.chat_id
  WHERE (c.user_a = s.user_id OR c.user_b = s.user_id) AND (m.cipher IS NULL OR m.sender_id = s.user_id)
), 0);

CREATE TABLE t_p46289391_video_call_app_2.device_links (
  code VARCHAR(16) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  device_pub TEXT NOT NULL,
  device_name VARCHAR(120) NOT NULL DEFAULT '',
  payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);