import type { CoachRunStatus, CoachStopReason } from "./types";

/**
 * PRD §4.2：状态统一为 reading / ready / running / waiting_user / saving /
 * completed / failed / cancelled。
 *
 * reading = 正在读取并关联材料，还没有可执行的东西
 * ready   = 上下文就绪，等触发
 * running = 模型或工具正在执行
 * waiting_user = 缺用户信息或进入独立练习，持久化 checkpoint 后等待，不在后台空转
 * saving  = 产出已生成但未持久化；只显示「正在保存」
 * 终态    = completed / failed / cancelled
 */
const transitions: Record<CoachRunStatus, CoachRunStatus[]> = {
  reading: ["ready", "failed", "cancelled"],
  ready: ["running", "cancelled"],
  running: ["waiting_user", "saving", "failed", "cancelled"],
  waiting_user: ["running", "cancelled"],
  saving: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

/** 旧状态到新状态的兼容映射，用于读取迁移前写入的行。 */
const LEGACY_STATUS: Record<string, CoachRunStatus> = {
  queued: "running",
  planning: "running",
  awaiting_user: "waiting_user",
  verifying: "saving",
};

export function normalizeRunStatus(value: string): CoachRunStatus {
  const normalized = value.trim() as CoachRunStatus;
  if (normalized in transitions) return normalized;
  const mapped = LEGACY_STATUS[value.trim()];
  if (mapped) return mapped;
  throw new Error(`Unknown coach run status: ${value}`);
}

export const TERMINAL_STATUSES: readonly CoachRunStatus[] = ["completed", "failed", "cancelled"];

export function isTerminalRunStatus(status: CoachRunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransitionRun(from: CoachRunStatus, to: CoachRunStatus) {
  return transitions[from].includes(to);
}

export function assertRunTransition(from: CoachRunStatus, to: CoachRunStatus) {
  if (!canTransitionRun(from, to)) {
    throw new Error(`Invalid coach run transition: ${from} -> ${to}`);
  }
}

/** 终态必须由明确的停止原因支撑，避免「没报错就算成功」。 */
const STOP_REASON_BY_STATUS: Record<"completed" | "failed" | "cancelled", CoachStopReason[]> = {
  completed: ["completed"],
  failed: ["timeout", "cost_cap", "permission_denied", "no_evidence", "error"],
  cancelled: ["user_cancelled"],
};

export function allowedStopReasons(status: CoachRunStatus): CoachStopReason[] {
  if (status === "waiting_user") return ["awaiting_user"];
  if (isTerminalRunStatus(status)) return STOP_REASON_BY_STATUS[status as "completed" | "failed" | "cancelled"];
  return [];
}

export function isValidStopReason(status: CoachRunStatus, reason: CoachStopReason): boolean {
  return allowedStopReasons(status).includes(reason);
}
