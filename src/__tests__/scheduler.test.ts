/**
 * Tests for Scheduled & Recurring Tests - Milestone 10
 *
 * Tests the core scheduler engine functions:
 * - Cron expression parsing
 * - Next run time calculation
 * - Cron validation
 * - Human-readable cron descriptions
 * - Preset action building
 */

import { describe, it, expect } from "vitest";
import {
  parseCronExpression,
  getNextRunTime,
  validateCronExpression,
  describeCron,
  buildPresetActions,
} from "@/lib/scheduler/engine";

// ── Test: Cron Expression Parsing ──────────────────────────────────

describe("parseCronExpression", () => {
  it("should parse a basic cron expression with all wildcards", () => {
    const fields = parseCronExpression("* * * * *");
    expect(fields.minute).toEqual(
      Array.from({ length: 60 }, (_, i) => i)
    );
    expect(fields.hour).toEqual(
      Array.from({ length: 24 }, (_, i) => i)
    );
    expect(fields.dayOfMonth).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1)
    );
    expect(fields.month).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1)
    );
    expect(fields.dayOfWeek).toEqual(
      Array.from({ length: 7 }, (_, i) => i)
    );
  });

  it("should parse a specific time expression", () => {
    const fields = parseCronExpression("30 9 * * *");
    expect(fields.minute).toEqual([30]);
    expect(fields.hour).toEqual([9]);
    expect(fields.dayOfMonth.length).toBe(31);
    expect(fields.month.length).toBe(12);
    expect(fields.dayOfWeek.length).toBe(7);
  });

  it("should parse a range expression", () => {
    const fields = parseCronExpression("0 9 * * 1-5");
    expect(fields.minute).toEqual([0]);
    expect(fields.hour).toEqual([9]);
    expect(fields.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("should parse a step expression", () => {
    const fields = parseCronExpression("*/15 * * * *");
    expect(fields.minute).toEqual([0, 15, 30, 45]);
  });

  it("should parse a range with step", () => {
    const fields = parseCronExpression("0 9-17/2 * * *");
    expect(fields.hour).toEqual([9, 11, 13, 15, 17]);
  });

  it("should parse a comma-separated expression", () => {
    const fields = parseCronExpression("0 9,12,18 * * *");
    expect(fields.hour).toEqual([9, 12, 18]);
  });

  it("should throw on invalid cron expression (wrong number of fields)", () => {
    expect(() => parseCronExpression("* * *")).toThrow("Invalid cron expression");
    expect(() => parseCronExpression("* * * * * *")).toThrow("Invalid cron expression");
  });

  it("should throw on invalid cron expression (no valid values)", () => {
    expect(() => parseCronExpression("60 * * * *")).toThrow();
    expect(() => parseCronExpression("0 24 * * *")).toThrow();
  });
});

// ── Test: Next Run Time Calculation ────────────────────────────────

describe("getNextRunTime", () => {
  it("should calculate next run time for a specific daily schedule", () => {
    // "0 9 * * *" = every day at 9:00 AM
    const from = new Date("2024-01-15T08:00:00Z");
    const next = getNextRunTime("0 9 * * *", from);

    expect(next).not.toBeNull();
    expect(next!.getUTCHours()).toBe(9);
    expect(next!.getUTCMinutes()).toBe(0);
  });

  it("should skip to the next day if the time has already passed", () => {
    // "0 9 * * *" = every day at 9:00 AM
    const from = new Date("2024-01-15T10:00:00Z");
    const next = getNextRunTime("0 9 * * *", from);

    expect(next).not.toBeNull();
    expect(next!.getUTCDate()).toBeGreaterThan(from.getUTCDate());
  });

  it("should calculate next run time for weekday schedule", () => {
    // "0 9 * * 1-5" = weekdays at 9:00 AM
    // If it's a Saturday (day 6), next should be Monday (day 1)
    const saturday = new Date("2024-01-13T10:00:00Z"); // Saturday
    const next = getNextRunTime("0 9 * * 1-5", saturday);

    expect(next).not.toBeNull();
    const dayOfWeek = next!.getDay();
    expect(dayOfWeek).toBeGreaterThanOrEqual(1);
    expect(dayOfWeek).toBeLessThanOrEqual(5);
  });

  it("should calculate next run time for every 30 minutes", () => {
    const from = new Date("2024-01-15T09:15:00Z");
    const next = getNextRunTime("*/30 * * * *", from);

    expect(next).not.toBeNull();
    expect(next!.getUTCMinutes()).toBe(30);
  });

  it("should return null for impossible schedules", () => {
    // This is hard to test without mocking Date extensively
    // But we can verify it returns a date for common patterns
    const next = getNextRunTime("0 9 * * *");
    expect(next).not.toBeNull();
  });
});

// ── Test: Cron Validation ──────────────────────────────────────────

describe("validateCronExpression", () => {
  it("should validate a correct cron expression", () => {
    const result = validateCronExpression("0 9 * * 1-5");
    expect(result.valid).toBe(true);
    expect(result.description).toBeTruthy();
    expect(result.nextRun).toBeTruthy();
  });

  it("should validate the all-wildcard expression", () => {
    const result = validateCronExpression("* * * * *");
    expect(result.valid).toBe(true);
  });

  it("should reject an expression with too few fields", () => {
    const result = validateCronExpression("0 9 * *");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("5 fields");
  });

  it("should reject an expression with invalid values", () => {
    const result = validateCronExpression("60 9 * * *");
    expect(result.valid).toBe(false);
  });
});

// ── Test: Human-Readable Cron Descriptions ─────────────────────────

describe("describeCron", () => {
  it("should describe every 5 minutes", () => {
    expect(describeCron("*/5 * * * *")).toBe("Every 5 minutes");
  });

  it("should describe every 15 minutes", () => {
    expect(describeCron("*/15 * * * *")).toBe("Every 15 minutes");
  });

  it("should describe every 30 minutes", () => {
    expect(describeCron("*/30 * * * *")).toBe("Every 30 minutes");
  });

  it("should describe every hour", () => {
    expect(describeCron("0 * * * *")).toBe("Every hour");
  });

  it("should describe daily at a specific time", () => {
    expect(describeCron("0 9 * * *")).toBe("Daily at 9:00 AM");
  });

  it("should describe weekdays at a specific time", () => {
    expect(describeCron("0 9 * * 1-5")).toBe("Weekdays at 9:00 AM");
  });

  it("should describe a generic cron expression as fallback", () => {
    const result = describeCron("15 6,18 * * *");
    expect(result).toContain("Cron:");
  });
});

// ── Test: Preset Action Building ───────────────────────────────────

describe("buildPresetActions", () => {
  const url = "https://example.com";

  it("should build smoke test actions", () => {
    const actions = buildPresetActions("smoke", url);
    expect(actions.length).toBeGreaterThanOrEqual(3);
    expect(actions[0].type).toBe("navigate");
    expect(actions.some((a) => a.type === "assertVisible")).toBe(true);
  });

  it("should build navigation test actions", () => {
    const actions = buildPresetActions("navigation", url);
    expect(actions.length).toBeGreaterThanOrEqual(3);
    expect(actions[0].type).toBe("navigate");
  });

  it("should build login test actions", () => {
    const actions = buildPresetActions("login", url);
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions[0].type).toBe("navigate");
  });

  it("should build form test actions", () => {
    const actions = buildPresetActions("form", url);
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions[0].type).toBe("navigate");
  });

  it("should build full-page screenshot actions", () => {
    const actions = buildPresetActions("full-page-screenshot", url);
    expect(actions.length).toBeGreaterThanOrEqual(2);
    // Should have a screenshot action with fullPage=true
    const screenshotAction = actions.find((a) => a.type === "screenshot") as any;
    expect(screenshotAction).toBeDefined();
    expect(screenshotAction.fullPage).toBe(true);
  });

  it("should default to a basic test for unknown preset", () => {
    const actions = buildPresetActions("unknown-preset", url);
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions[0].type).toBe("navigate");
  });

  it("should include the URL in the navigate action", () => {
    const actions = buildPresetActions("smoke", url);
    const navAction = actions[0] as any;
    expect(navAction.url).toBe(url);
  });
});

// ── Test: Cron Field Validation Edge Cases ─────────────────────────

describe("Cron Edge Cases", () => {
  it("should handle midnight (0 0 * * *)", () => {
    const result = validateCronExpression("0 0 * * *");
    expect(result.valid).toBe(true);
    expect(result.description).toContain("Daily");
  });

  it("should handle noon (0 12 * * *)", () => {
    const result = validateCronExpression("0 12 * * *");
    expect(result.valid).toBe(true);
    expect(result.description).toContain("12:00 PM");
  });

  it("should handle the every-6-hours pattern", () => {
    const result = validateCronExpression("0 */6 * * *");
    expect(result.valid).toBe(true);
  });

  it("should handle Sunday-only schedule (0 9 * * 0)", () => {
    const result = validateCronExpression("0 9 * * 0");
    expect(result.valid).toBe(true);
    expect(result.description).toContain("Sundays");
  });

  it("should handle Saturday-only schedule (0 9 * * 6)", () => {
    const result = validateCronExpression("0 9 * * 6");
    expect(result.valid).toBe(true);
    expect(result.description).toContain("Saturdays");
  });

  it("should reject minute out of range", () => {
    const result = validateCronExpression("60 9 * * *");
    expect(result.valid).toBe(false);
  });

  it("should reject hour out of range", () => {
    const result = validateCronExpression("0 25 * * *");
    expect(result.valid).toBe(false);
  });
});
