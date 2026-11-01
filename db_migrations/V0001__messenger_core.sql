CREATE TABLE t_p46289391_video_call_app_2.users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(80) NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  status VARCHAR(140) NOT NULL DEFAULT '',
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_p46289391_video_call_app_2.sessions (
  token VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_p46289391_video_call_app_2.contacts (
  owner_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  contact_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, contact_id)
);

CREATE TABLE t_p46289391_video_call_app_2.chats (
  id SERIAL PRIMARY KEY,
  user_a INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  user_b INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_a, user_b)
);

CREATE TABLE t_p46289391_video_call_app_2.messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.chats(id),
  sender_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX idx_messages_chat ON t_p46289391_video_call_app_2.messages(chat_id, id);

CREATE TABLE t_p46289391_video_call_app_2.calls (
  id SERIAL PRIMARY KEY,
  caller_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  callee_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  kind VARCHAR(10) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'ringing',
  offer TEXT,
  answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);
CREATE INDEX idx_calls_callee ON t_p46289391_video_call_app_2.calls(callee_id, status);
CREATE INDEX idx_calls_caller ON t_p46289391_video_call_app_2.calls(caller_id);