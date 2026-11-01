CREATE TABLE t_p46289391_video_call_app_2.key_waits (
  chat_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.chats(id),
  sender_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  recipient_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chat_id, sender_id)
);
CREATE INDEX idx_key_waits_recipient ON t_p46289391_video_call_app_2.key_waits(recipient_id);