/**
 * 生成唯一 ID
 */
export function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${performance.now()}`;
}

/**
 * 生成简单的唯一 ID（用于消息）
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

