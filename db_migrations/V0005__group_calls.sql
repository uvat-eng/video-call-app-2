CREATE TABLE t_p46289391_video_call_app_2.group_calls (
  id SERIAL PRIMARY KEY,
  host_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  kind VARCHAR(10) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE t_p46289391_video_call_app_2.group_members (
  call_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.group_calls(id),
  user_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  state VARCHAR(12) NOT NULL DEFAULT 'invited',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  last_ping TIMESTAMPTZ,
  PRIMARY KEY (call_id, user_id)
);
CREATE INDEX idx_group_members_user ON t_p46289391_video_call_app_2.group_members(user_id, state);

CREATE TABLE t_p46289391_video_call_app_2.group_signals (
  id SERIAL PRIMARY KEY,
  call_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.group_calls(id),
  from_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  to_id INTEGER NOT NULL REFERENCES t_p46289391_video_call_app_2.users(id),
  payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_group_signals_to ON t_p46289391_video_call_app_2.group_signals(to_id, call_id) WHERE delivered = FALSE;