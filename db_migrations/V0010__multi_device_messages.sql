ALTER TABLE t_p46289391_video_call_app_2.messages ADD COLUMN self_cipher TEXT;
ALTER TABLE t_p46289391_video_call_app_2.messages ADD COLUMN self_iv VARCHAR(32);
ALTER TABLE t_p46289391_video_call_app_2.messages ADD COLUMN sender_session INTEGER;
CREATE INDEX idx_messages_chat_id ON t_p46289391_video_call_app_2.messages(chat_id, id);