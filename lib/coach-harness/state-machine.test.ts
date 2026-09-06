import {
  allowedStopReasons,
  assertRunTransition,
  canTransitionRun,
  isTerminalRunStatus,
  isValidStopReason,
  normalizeRunStatus,
} from "./state-machine";

test("coach runs only use durable transitions", () => {
  expect(canTransitionRun("running", "saving")).toBe(true);
  expect(canTransitionRun("saving", "completed")).toBe(true);
  expect(canTransitionRun("completed", "running")).toBe(false);
  expect(() => assertRunTransition("completed", "running")).toThrow("Invalid coach run transition");
});

test("reading materials comes before an executable run", () => {
  expect(canTransitionRun("reading", "ready")).toBe(true);
  expect(canTransitionRun("reading", "running")).toBe(false);
});

test("unsaved output cannot be reported as completed", () => {
  // PRD §4.2：生成完但未持久化只显示「正在保存」。
  expect(canTransitionRun("running", "completed")).toBe(false);
  expect(canTransitionRun("running", "saving")).toBe(true);
});

test("waiting on the user resumes instead of spinning in the background", () => {
  expect(canTransitionRun("running", "waiting_user")).toBe(true);
  expect(canTransitionRun("waiting_user", "running")).toBe(true);
  expect(canTransitionRun("waiting_user", "completed")).toBe(false);
});

test("legacy statuses still read after migration", () => {
  expect(normalizeRunStatus("queued")).toBe("running");
  expect(normalizeRunStatus("planning")).toBe("running");
  expect(normalizeRunStatus("awaiting_user")).toBe("waiting_user");
  expect(normalizeRunStatus("verifying")).toBe("saving");
  expect(normalizeRunStatus("failed")).toBe("failed");
  expect(() => normalizeRunStatus("nope")).toThrow("Unknown coach run status");
});

test("terminal states carry an explicit stop reason", () => {
  expect(isTerminalRunStatus("completed")).toBe(true);
  expect(isTerminalRunStatus("failed")).toBe(true);
  expect(isTerminalRunStatus("running")).toBe(false);
  expect(isValidStopReason("failed", "cost_cap")).toBe(true);
  expect(isValidStopReason("failed", "completed")).toBe(false);
  expect(isValidStopReason("completed", "completed")).toBe(true);
  expect(isValidStopReason("running", "timeout")).toBe(false);
  expect(allowedStopReasons("cancelled")).toEqual(["user_cancelled"]);
});
