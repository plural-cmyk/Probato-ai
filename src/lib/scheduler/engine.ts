/**
 * Probato Scheduler Engine
 *
 * Core engine for scheduled & recurring tests.
 * Handles:
 * - Simple cron expression parsing (no external deps)
 * - Next run time calculation
 * - Schedule execution (finding due schedules, running tests, updating state)
 * - Preset-to-actions mapping
 */

import { db } from "@/lib/db";
import { executeTestRun } from "@/lib/agent/test-executor";
import { TestAction, sel, actions } from "@/lib/agent/actions";
import { VERCEL_HOBBY_TIMEOUT } from "@/lib/browser/chromium";
import {
  dispatchNotification,
  buildTestRunNotificationTitle,
  buildTestRunNotificationMessage,
} from "@/lib/notifications/dispatcher";

// ── Cron Expression Parser ─────────────────────────────────────────

interface CronFields {
  minute: number[];   // 0-59
  hour: number[];     // 0-23
  dayOfMonth: number[]; // 1-31
  month: number[];    // 1-12
  dayOfWeek: number[]; // 0-6 (0 = Sunday)
}

/**
 * Parse a simple cron expression into its field components.
 * Supports: wildcard, specific values, ranges (1-5), steps (star/5, 1-5/2)
 */
export function parseCronExpression(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron expression "${expr}". Expected 5 fields: minute hour dayOfMonth month dayOfWeek`
    );
  }

  const [minuteStr, hourStr, dayOfMonthStr, monthStr, dayOfWeekStr] = parts;

  return {
    minute: parseField(minuteStr, 0, 59, "minute"),
    hour: parseField(hourStr, 0, 23, "hour"),
    dayOfMonth: parseField(dayOfMonthStr, 1, 31, "dayOfMonth"),
    month: parseField(monthStr, 1, 12, "month"),
    dayOfWeek: parseField(dayOfWeekStr, 0, 6, "dayOfWeek"),
  };
}

function parseField(field: string, min: number, max: number, name: string): number[] {
  // Handle multiple values separated by comma
  const values: number[] = [];
  const segments = field.split(",");

  for (const segment of segments) {
    const [rangePart, stepPart] = segment.split("/");

    let rangeMin = min;
    let rangeMax = max;

    if (rangePart === "*") {
      // All values in range
    } else if (rangePart.includes("-")) {
      const [startStr, endStr] = rangePart.split("-");
      rangeMin = parseInt(startStr, 10);
      rangeMax = parseInt(endStr, 10);
    } else {
      rangeMin = parseInt(rangePart, 10);
      rangeMax = rangeMin;
    }

    const step = stepPart ? parseInt(stepPart, 10) : 1;

    for (let i = rangeMin; i <= rangeMax; i += step) {
      if (i >= min && i <= max) {
        values.push(i);
      }
    }
  }

  if (values.length === 0) {
    throw new Error(`Invalid cron field for ${name}: "${field}" — no valid values`);
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Calculate the next run time for a cron expression starting from a given date.
 * Iterates minute-by-minute (optimized with field matching) to find the next match.
 * Returns null if no match found within 4 years (safety limit).
 */
export function getNextRunTime(cronExpression: string, from?: Date): Date | null {
  const fields = parseCronExpression(cronExpression);
  const start = from ?? new Date();

  // Start from the next minute (we don't want to re-run at the current minute)
  const candidate = new Date(start);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // Safety: limit search to 4 years
  const maxTime = new Date(start.getTime() + 4 * 365 * 24 * 60 * 60 * 1000);

  while (candidate <= maxTime) {
    const minute = candidate.getMinutes();
    const hour = candidate.getHours();
    const dayOfMonth = candidate.getDate();
    const month = candidate.getMonth() + 1; // JS months are 0-indexed
    const dayOfWeek = candidate.getDay(); // 0 = Sunday

    if (
      fields.month.includes(month) &&
      fields.dayOfMonth.includes(dayOfMonth) &&
      fields.dayOfWeek.includes(dayOfWeek) &&
      fields.hour.includes(hour) &&
      fields.minute.includes(minute)
    ) {
      return candidate;
    }

    // Advance to next candidate
    if (!fields.month.includes(month)) {
      // Skip to next month
      candidate.setMonth(candidate.getMonth() + 1, 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    if (!fields.dayOfMonth.includes(dayOfMonth) || !fields.dayOfWeek.includes(dayOfWeek)) {
      // Skip to next day
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    if (!fields.hour.includes(hour)) {
      // Skip to next matching hour
      const nextHour = fields.hour.find((h) => h > hour);
      if (nextHour !== undefined) {
        candidate.setHours(nextHour, 0, 0, 0);
      } else {
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(0, 0, 0, 0);
      }
      continue;
    }

    // Advance by one minute
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}

// ── Human-Readable Cron Description ─────────────────────────────────

/**
 * Convert a cron expression to a human-readable description.
 */
export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Common patterns
  if (minute === "*/5" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every 5 minutes";
  }
  if (minute === "*/15" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every 15 minutes";
  }
  if (minute === "*/30" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every 30 minutes";
  }
  if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every hour";
  }
  if (minute === "0" && !hour.includes("*") && !hour.includes("/") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Daily at ${formatHour(hour)}`;
  }
  if (minute === "0" && !hour.includes("*") && !hour.includes("/") && dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") {
    return `Weekdays at ${formatHour(hour)}`;
  }
  if (minute === "0" && !hour.includes("*") && !hour.includes("/") && dayOfMonth === "*" && month === "*" && dayOfWeek === "0") {
    return `Sundays at ${formatHour(hour)}`;
  }
  if (minute === "0" && !hour.includes("*") && !hour.includes("/") && dayOfMonth === "*" && month === "*" && dayOfWeek === "6") {
    return `Saturdays at ${formatHour(hour)}`;
  }
  if (minute === "0" && !hour.includes("*") && !hour.includes("/") && dayOfMonth === "*" && month === "*" && !dayOfWeek.includes("*")) {
    return `${formatDayOfWeek(dayOfWeek)} at ${formatHour(hour)}`;
  }

  // Generic fallback
  return `Cron: ${expr}`;
}

function formatHour(hour: string): string {
  const h = parseInt(hour, 10);
  if (isNaN(h)) return `${hour}:00`;
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

function formatDayOfWeek(dayOfWeek: string): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (dayOfWeek === "1-5") return "Mon-Fri";
  if (dayOfWeek === "0,6") return "Sat-Sun";
  const num = parseInt(dayOfWeek, 10);
  if (!isNaN(num) && num >= 0 && num <= 6) return dayNames[num];
  return dayOfWeek;
}

// ── Preset → Actions Mapping ───────────────────────────────────────

/**
 * Build test actions for a given preset and URL.
 * Same presets used by the dashboard test runner.
 */
export function buildPresetActions(preset: string, url: string): TestAction[] {
  switch (preset) {
    case "smoke":
      return [
        actions.navigate(url, `Navigate to ${url}`),
        actions.waitForSelector(sel.css("body"), 10000, "Wait for page body"),
        actions.screenshot(false, "Page loaded"),
        actions.assertVisible(sel.css("body"), "Verify page body is visible"),
      ];

    case "navigation":
      return [
        actions.navigate(url, `Navigate to ${url}`),
        actions.waitForSelector(sel.css("body"), 10000, "Wait for page body"),
        actions.waitForSelector(sel.css("nav, header, [role=navigation]"), 5000, "Check for navigation"),
        actions.screenshot(false, "Navigation check"),
        actions.assertVisible(sel.css("body"), "Verify page is visible"),
      ];

    case "login":
      return [
        actions.navigate(url, `Navigate to login`),
        actions.waitForSelector(sel.css("body"), 10000, "Wait for page body"),
        actions.screenshot(false, "Login page loaded"),
        actions.assertVisible(sel.css("body"), "Verify page is visible"),
      ];

    case "form":
      return [
        actions.navigate(url, `Navigate to page`),
        actions.waitForSelector(sel.css("body"), 10000, "Wait for page body"),
        actions.waitForSelector(sel.css("form, input, textarea, select"), 5000, "Check for form elements"),
        actions.screenshot(false, "Form check"),
        actions.assertVisible(sel.css("body"), "Verify page is visible"),
      ];

    case "full-page-screenshot":
      return [
        actions.navigate(url, `Navigate to ${url}`),
        actions.waitForSelector(sel.css("body"), 10000, "Wait for page body"),
        actions.screenshot(true, "Full page screenshot"),
      ];

    default:
      return [
        actions.navigate(url, `Navigate to ${url}`),
        actions.waitForSelector(sel.css("body"), 10000, "Wait for page body"),
        actions.screenshot(false, "Page check"),
      ];
  }
}

// ── Schedule Execution Engine ───────────────────────────────────────

export interface ScheduleExecutionResult {
  scheduleId: string;
  scheduleName: string;
  testRunId: string | null;
  status: "passed" | "failed" | "error" | "skipped";
  error?: string;
  duration: number;
}

/**
 * Find all schedules that are due for execution and run them.
 * Called by the cron trigger endpoint.
 */
export async function executeDueSchedules(): Promise<{
  executed: ScheduleExecutionResult[];
  skipped: number;
  errors: number;
}> {
  const now = new Date();

  // Find all enabled schedules that are due
  const dueSchedules = await db.schedule.findMany({
    where: {
      enabled: true,
      nextRunAt: {
        lte: now,
      },
    },
    include: {
      project: true,
      user: { select: { id: true } },
    },
  });

  console.log(`[Scheduler] Found ${dueSchedules.length} due schedules at ${now.toISOString()}`);

  const results: ScheduleExecutionResult[] = [];
  let skipped = 0;
  let errors = 0;

  for (const schedule of dueSchedules) {
    try {
      const result = await executeSchedule({
        ...schedule,
        userId: schedule.user?.id,
      });
      results.push(result);

      if (result.status === "error") {
        errors++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Scheduler] Failed to execute schedule ${schedule.id}: ${message}`);

      results.push({
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        testRunId: null,
        status: "error",
        error: message,
        duration: 0,
      });

      errors++;

      // Still update the schedule to prevent it from being stuck
      await updateScheduleAfterRun(schedule.id, "error", null);
    }
  }

  // Also check for schedules without nextRunAt set (newly created)
  const newSchedules = await db.schedule.findMany({
    where: {
      enabled: true,
      nextRunAt: null,
    },
    include: {
      project: true,
    },
  });

  for (const schedule of newSchedules) {
    // Calculate and set nextRunAt
    const nextRun = getNextRunTime(schedule.cronExpression);
    await db.schedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: nextRun },
    });
    skipped++;
  }

  return { executed: results, skipped, errors };
}

/**
 * Execute a single schedule: run the test and update the schedule record.
 */
export async function executeSchedule(
  schedule: {
    id: string;
    name: string;
    url: string;
    preset: string;
    cronExpression: string;
    projectId: string | null;
    userId?: string;
  }
): Promise<ScheduleExecutionResult> {
  const startTime = Date.now();

  console.log(`[Scheduler] Executing schedule "${schedule.name}" (${schedule.id})`);

  // Build test actions from preset
  const testActions = buildPresetActions(schedule.preset, schedule.url);

  // Determine project ID (create a virtual project if none)
  let projectId = schedule.projectId;

  // Execute the test
  try {
    const isVercel = !!process.env.VERCEL;
    const overallTimeout = isVercel ? VERCEL_HOBBY_TIMEOUT : 120000;

    const result = await Promise.race([
      executeTestRun({
        url: schedule.url,
        actions: testActions,
        viewport: { width: 1280, height: 720 },
        screenshotEveryStep: true,
        maxSteps: 30,
        timeout: 5000,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Schedule test timed out after ${Math.round(overallTimeout / 1000)}s`)),
          overallTimeout
        )
      ),
    ]);

    const duration = Date.now() - startTime;

    // Persist the test run
    let testRunId: string | null = null;

    if (projectId) {
      const testRun = await db.testRun.create({
        data: {
          projectId,
          status: result.status,
          triggeredBy: "schedule",
          scheduleId: schedule.id,
          startedAt: new Date(result.startedAt),
          endedAt: new Date(result.endedAt),
          logs: JSON.stringify(result.summary),
        },
      });
      testRunId = testRun.id;

      // Save step results
      for (let i = 0; i < result.steps.length; i++) {
        const step = result.steps[i];
        if (step.status === "passed" || step.status === "failed") {
          await db.testResult.create({
            data: {
              testRunId: testRun.id,
              testName: step.action.label ?? `Step ${i + 1}: ${step.action.type}`,
              featureName: step.action.type,
              status: step.status,
              duration: step.duration,
              error: step.error,
            },
          });
        }
      }
    }

    // Update schedule record
    await updateScheduleAfterRun(schedule.id, result.status, testRunId);

    console.log(
      `[Scheduler] Schedule "${schedule.name}" completed: ${result.status} in ${duration}ms ` +
      `(${result.summary.passed}/${result.summary.total} passed)`
    );

    // Dispatch notification to schedule owner
    if (schedule.userId) {
      try {
        const notifType = result.status === "passed" ? "schedule_complete" as const
          : result.status === "failed" ? "test_fail" as const
          : "test_error" as const;
        await dispatchNotification({
          type: notifType,
          title: buildTestRunNotificationTitle(result.status, schedule.name, "schedule"),
          message: buildTestRunNotificationMessage(schedule.name, result.status, result.summary, result.duration),
          userId: schedule.userId,
          projectId: projectId ?? undefined,
          testRunId: testRunId ?? undefined,
          actionUrl: `${process.env.NEXTAUTH_URL || "https://probato-ai.vercel.app"}/dashboard`,
          priority: result.status === "failed" ? "high" : result.status === "error" ? "high" : "low",
          metadata: {
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            preset: schedule.preset,
            url: schedule.url,
            triggeredBy: "schedule",
          },
        });
      } catch (notifError) {
        console.error("[Scheduler] Failed to dispatch notification:", notifError);
      }
    }

    return {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      testRunId,
      status: result.status === "error" ? "error" : result.status,
      duration,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;

    // Update schedule record
    await updateScheduleAfterRun(schedule.id, "error", null);

    console.error(`[Scheduler] Schedule "${schedule.name}" failed: ${message}`);

    return {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      testRunId: null,
      status: "error",
      error: message,
      duration,
    };
  }
}

/**
 * Update a schedule after a run: increment counters, set lastRun*, calculate nextRunAt.
 */
async function updateScheduleAfterRun(
  scheduleId: string,
  status: string,
  testRunId: string | null
): Promise<void> {
  const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) return;

  const nextRun = getNextRunTime(schedule.cronExpression);

  await db.schedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: new Date(),
      lastRunStatus: status,
      lastRunId: testRunId,
      nextRunAt: nextRun,
      runCount: { increment: 1 },
      failCount: status === "failed" || status === "error" ? { increment: 1 } : undefined,
    },
  });
}

/**
 * Recalculate nextRunAt for all enabled schedules.
 * Useful after bulk changes or on server restart.
 */
export async function recalculateNextRuns(): Promise<number> {
  const schedules = await db.schedule.findMany({
    where: { enabled: true },
  });

  let updated = 0;
  for (const schedule of schedules) {
    const nextRun = getNextRunTime(schedule.cronExpression);
    await db.schedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: nextRun },
    });
    updated++;
  }

  return updated;
}

// ── Cron Validation ────────────────────────────────────────────────

export interface CronValidationResult {
  valid: boolean;
  error?: string;
  description?: string;
  nextRun?: string;
}

/**
 * Validate a cron expression and return metadata about it.
 */
export function validateCronExpression(expr: string): CronValidationResult {
  try {
    const fields = parseCronExpression(expr);

    // Validate ranges
    if (fields.minute.some((m) => m < 0 || m > 59)) {
      return { valid: false, error: "Minute must be between 0 and 59" };
    }
    if (fields.hour.some((h) => h < 0 || h > 23)) {
      return { valid: false, error: "Hour must be between 0 and 23" };
    }
    if (fields.dayOfMonth.some((d) => d < 1 || d > 31)) {
      return { valid: false, error: "Day of month must be between 1 and 31" };
    }
    if (fields.month.some((m) => m < 1 || m > 12)) {
      return { valid: false, error: "Month must be between 1 and 12" };
    }
    if (fields.dayOfWeek.some((d) => d < 0 || d > 6)) {
      return { valid: false, error: "Day of week must be between 0 (Sunday) and 6 (Saturday)" };
    }

    const description = describeCron(expr);
    const nextRun = getNextRunTime(expr);

    return {
      valid: true,
      description,
      nextRun: nextRun?.toISOString(),
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
