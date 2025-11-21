-- AI Job Coach 数据库 Schema
-- 适用于 Supabase 和 PostgreSQL

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  provider TEXT, -- 'phone' | 'email' | 'oauth'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 会话表（支持多端、多会话）
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 对话消息表
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  stage TEXT, -- 当前阶段，用于区分不同阶段的对话
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 白板状态表
CREATE TABLE IF NOT EXISTS whiteboard_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  whiteboard JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id) -- 每个会话只有一个白板状态
);

-- 5. 用户进度表
CREATE TABLE IF NOT EXISTS user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL DEFAULT 'career_planning',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id) -- 每个用户只有一个进度记录
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON conversation_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON conversation_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_whiteboard_session_id ON whiteboard_states(session_id);
CREATE INDEX IF NOT EXISTS idx_progress_user_id ON user_progress(user_id);

-- 更新 updated_at 的触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 sessions 表添加触发器
CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 为 whiteboard_states 表添加触发器
CREATE TRIGGER update_whiteboard_updated_at
  BEFORE UPDATE ON whiteboard_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 为 user_progress 表添加触发器
CREATE TRIGGER update_progress_updated_at
  BEFORE UPDATE ON user_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

