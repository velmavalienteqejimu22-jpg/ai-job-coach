/**
 * 数据库操作封装
 * 支持 Supabase 和 PostgreSQL
 */

// 根据环境变量选择数据库客户端
type DbClient = 
  | { type: 'supabase'; from: (table: string) => any; [key: string]: any }
  | { type: 'postgres'; pool: any };

let dbClient: DbClient | null = null;

// 初始化数据库客户端
async function getDbClient(): Promise<DbClient | null> {
  if (dbClient) {
    return dbClient;
  }

  // 优先使用 Supabase
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      dbClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );
      return dbClient;
    } catch (error) {
      console.error('Failed to initialize Supabase client:', error);
    }
  }

  // 如果没有 Supabase，尝试使用 Postgres（通过 Vercel Postgres）
  if (process.env.POSTGRES_URL) {
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });
      dbClient = { pool, type: 'postgres' };
      return dbClient;
    } catch (error) {
      console.error('Failed to initialize Postgres client:', error);
    }
  }

  // 如果没有配置数据库，返回 null 而不是抛出错误
  // 这样可以让应用在没有数据库时也能运行（使用 localStorage）
  console.warn('No database client available. Application will use localStorage for data persistence.');
  return null;
}

// ==================== 用户相关 ====================

/**
 * 创建或获取用户
 */
export async function getOrCreateUser(phone?: string, email?: string): Promise<string | null> {
  const client = await getDbClient();
  if (!client) {
    return null; // 数据库不可用，返回 null
  }

  if (client.type === 'postgres') {
    // Postgres 实现
    // 先尝试查找现有用户
    if (phone) {
      const { rows: existingRows } = await client.pool.query(
        'SELECT id FROM users WHERE phone = $1',
        [phone]
      );
      if (existingRows.length > 0) {
        await client.pool.query(
          'UPDATE users SET last_active = NOW() WHERE id = $1',
          [existingRows[0].id]
        );
        return existingRows[0].id;
      }
    }
    if (email) {
      const { rows: existingRows } = await client.pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      if (existingRows.length > 0) {
        await client.pool.query(
          'UPDATE users SET last_active = NOW() WHERE id = $1',
          [existingRows[0].id]
        );
        return existingRows[0].id;
      }
    }
    
    // 创建新用户
    const { rows } = await client.pool.query(
      `INSERT INTO users (phone, email, provider, last_active)
       VALUES ($1, $2, $3, NOW())
       RETURNING id`,
      [phone || null, email || null, phone ? 'phone' : email ? 'email' : 'anonymous']
    );
    return rows[0].id;
  } else {
    // Supabase 实现
    const identifier = phone || email;
    const provider = phone ? 'phone' : email ? 'email' : 'anonymous';

    // 尝试查找现有用户
    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq(phone ? 'phone' : 'email', identifier)
      .single();

    if (existingUser) {
      // 更新最后活跃时间
      await client
        .from('users')
        .update({ last_active: new Date().toISOString() })
        .eq('id', existingUser.id);
      return existingUser.id;
    }

    // 创建新用户
    const { data: newUser, error } = await client
      .from('users')
      .insert({
        phone: phone || null,
        email: email || null,
        provider,
        last_active: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return newUser.id;
  }
}

// ==================== 会话相关 ====================

/**
 * 创建新会话
 */
export async function createSession(userId: string): Promise<string | null> {
  const client = await getDbClient();
  if (!client) {
    return null; // 数据库不可用，返回 null
  }

  if (client.type === 'postgres') {
    const { rows } = await client.pool.query(
      'INSERT INTO sessions (user_id) VALUES ($1) RETURNING id',
      [userId]
    );
    return rows[0].id;
  } else {
    const { data, error } = await client
      .from('sessions')
      .insert({ user_id: userId })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }
}

/**
 * 获取用户的最新会话
 */
export async function getLatestSession(userId: string): Promise<string | null> {
  const client = await getDbClient();
  if (!client) {
    return null; // 数据库不可用，返回 null
  }

  if (client.type === 'postgres') {
    const { rows } = await client.pool.query(
      'SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    return rows[0]?.id || null;
  } else {
    const { data, error } = await client
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.id;
  }
}

// ==================== 消息相关 ====================

/**
 * 保存消息
 */
export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  stage?: string
): Promise<void> {
  const client = await getDbClient();
  if (!client) {
    return; // 数据库不可用，静默失败
  }

  if (client.type === 'postgres') {
    await client.pool.query(
      'INSERT INTO conversation_messages (session_id, role, content, stage) VALUES ($1, $2, $3, $4)',
      [sessionId, role, content, stage || null]
    );
  } else {
    const { error } = await client
      .from('conversation_messages')
      .insert({
        session_id: sessionId,
        role,
        content,
        stage: stage || null,
      });

    if (error) throw error;
  }
}

/**
 * 获取会话的所有消息
 */
export async function getMessages(sessionId: string): Promise<Array<{
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  stage: string | null;
  created_at: string;
}>> {
  const client = await getDbClient();
  if (!client) {
    return []; // 数据库不可用，返回空数组
  }

  if (client.type === 'postgres') {
    const { rows } = await client.pool.query(
      'SELECT id, role, content, stage, created_at FROM conversation_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );
    return rows;
  } else {
    const { data, error } = await client
      .from('conversation_messages')
      .select('id, role, content, stage, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }
}

// ==================== 白板相关 ====================

/**
 * 保存白板状态
 */
export async function saveWhiteboard(sessionId: string, whiteboard: any): Promise<void> {
  const client = await getDbClient();
  if (!client) {
    return; // 数据库不可用，静默失败
  }

  if (client.type === 'postgres') {
    await client.pool.query(
      `INSERT INTO whiteboard_states (session_id, whiteboard, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id)
       DO UPDATE SET whiteboard = $2, updated_at = NOW()`,
      [sessionId, JSON.stringify(whiteboard)]
    );
  } else {
    // Supabase upsert
    const { error } = await client
      .from('whiteboard_states')
      .upsert({
        session_id: sessionId,
        whiteboard,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'session_id',
      });

    if (error) {
      // 如果 upsert 失败，尝试先删除再插入
      await client
        .from('whiteboard_states')
        .delete()
        .eq('session_id', sessionId);
      
      const { error: insertError } = await client
        .from('whiteboard_states')
        .insert({
          session_id: sessionId,
          whiteboard,
          updated_at: new Date().toISOString(),
        });
      
      if (insertError) throw insertError;
    }
  }
}

/**
 * 获取白板状态
 */
export async function getWhiteboard(sessionId: string): Promise<any> {
  const client = await getDbClient();
  if (!client) {
    return {}; // 数据库不可用，返回空对象
  }

  if (client.type === 'postgres') {
    const { rows } = await client.pool.query(
      'SELECT whiteboard FROM whiteboard_states WHERE session_id = $1',
      [sessionId]
    );
    return rows[0]?.whiteboard || {};
  } else {
    const { data, error } = await client
      .from('whiteboard_states')
      .select('whiteboard')
      .eq('session_id', sessionId)
      .single();

    if (error || !data) return {};
    return data.whiteboard || {};
  }
}

// ==================== 进度相关 ====================

/**
 * 设置用户当前阶段
 */
export async function setUserStage(userId: string, stage: string): Promise<void> {
  const client = await getDbClient();
  if (!client) {
    return; // 数据库不可用，静默失败
  }

  if (client.type === 'postgres') {
    await client.pool.query(
      `INSERT INTO user_progress (user_id, current_stage, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET current_stage = $2, updated_at = NOW()`,
      [userId, stage]
    );
  } else {
    // Supabase upsert
    const { error } = await client
      .from('user_progress')
      .upsert({
        user_id: userId,
        current_stage: stage,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (error) {
      // 如果 upsert 失败，尝试先删除再插入
      await client
        .from('user_progress')
        .delete()
        .eq('user_id', userId);
      
      const { error: insertError } = await client
        .from('user_progress')
        .insert({
          user_id: userId,
          current_stage: stage,
          updated_at: new Date().toISOString(),
        });
      
      if (insertError) throw insertError;
    }
  }
}

/**
 * 获取用户当前阶段
 */
export async function getUserStage(userId: string): Promise<string> {
  const client = await getDbClient();
  if (!client) {
    return 'career_planning'; // 数据库不可用，返回默认阶段
  }

  if (client.type === 'postgres') {
    const { rows } = await client.pool.query(
      'SELECT current_stage FROM user_progress WHERE user_id = $1',
      [userId]
    );
    return rows[0]?.current_stage || 'career_planning';
  } else {
    const { data, error } = await client
      .from('user_progress')
      .select('current_stage')
      .eq('user_id', userId)
      .single();

    if (error || !data) return 'career_planning';
    return data.current_stage || 'career_planning';
  }
}

// ==================== 简历相关 ====================

/**
 * 保存简历解析结果
 */
export async function saveResume(
  userId: string,
  sessionId: string,
  resumeData: {
    rawText: string;
    parsed: any;
  }
): Promise<string> {
  const client = await getDbClient();
  if (!client) {
    // 数据库不可用，生成临时 ID
    return `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  const { v4: uuidv4 } = await import('uuid');
  const resumeId = uuidv4();

  if (client.type === 'postgres') {
    await client.pool.query(
      `INSERT INTO resumes (id, user_id, session_id, raw_text, parsed_data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [resumeId, userId, sessionId, resumeData.rawText, JSON.stringify(resumeData.parsed)]
    );
  } else {
    const { error } = await client
      .from('resumes')
      .insert({
        id: resumeId,
        user_id: userId,
        session_id: sessionId,
        raw_text: resumeData.rawText,
        parsed_data: resumeData.parsed,
        created_at: new Date().toISOString(),
      });

    if (error) throw error;
  }

  return resumeId;
}

