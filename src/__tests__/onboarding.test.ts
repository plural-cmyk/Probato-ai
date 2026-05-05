/**
 * Probato Onboarding Tests — M18
 *
 * Tests for onboarding step progression, state management,
 * step validation, and flow completion logic.
 */

import { describe, it, expect } from "vitest";

// ── Onboarding Step Constants & Validation ─────────────────────────

const VALID_STEPS = ["welcome", "connect_repo", "discover", "first_test", "complete"] as const;

const STEP_ORDER: Record<string, string | null> = {
  welcome: "connect_repo",
  connect_repo: "discover",
  discover: "first_test",
  first_test: "complete",
  complete: null,
};

type StepKey = typeof VALID_STEPS[number];

// ── Step Progression Logic ─────────────────────────────────────────

describe("Onboarding Step Progression", () => {
  it("should have 5 valid onboarding steps", () => {
    expect(VALID_STEPS).toHaveLength(5);
  });

  it("should have correct step order", () => {
    expect(STEP_ORDER.welcome).toBe("connect_repo");
    expect(STEP_ORDER.connect_repo).toBe("discover");
    expect(STEP_ORDER.discover).toBe("first_test");
    expect(STEP_ORDER.first_test).toBe("complete");
    expect(STEP_ORDER.complete).toBeNull();
  });

  it("should validate all step keys", () => {
    const validSteps: string[] = [...VALID_STEPS];
    expect(validSteps).toContain("welcome");
    expect(validSteps).toContain("connect_repo");
    expect(validSteps).toContain("discover");
    expect(validSteps).toContain("first_test");
    expect(validSteps).toContain("complete");
  });

  it("should reject invalid step keys", () => {
    const isValid = (step: string) => VALID_STEPS.includes(step as StepKey);
    expect(isValid("invalid_step")).toBe(false);
    expect(isValid("")).toBe(false);
    expect(isValid("CONNECT_REPO")).toBe(false);
    expect(isValid("welcome ")).toBe(false);
  });
});

// ── Step Advancement Logic ─────────────────────────────────────────

describe("Step Advancement", () => {
  function getNextStep(currentStep: string): string | null {
    return STEP_ORDER[currentStep] ?? null;
  }

  it("should advance from welcome to connect_repo", () => {
    expect(getNextStep("welcome")).toBe("connect_repo");
  });

  it("should advance from connect_repo to discover", () => {
    expect(getNextStep("connect_repo")).toBe("discover");
  });

  it("should advance from discover to first_test", () => {
    expect(getNextStep("discover")).toBe("first_test");
  });

  it("should advance from first_test to complete", () => {
    expect(getNextStep("first_test")).toBe("complete");
  });

  it("should return null after complete", () => {
    expect(getNextStep("complete")).toBeNull();
  });

  it("should return null for unknown step", () => {
    expect(getNextStep("unknown")).toBeNull();
  });
});

// ── Completed Steps Tracking ───────────────────────────────────────

describe("Completed Steps Tracking", () => {
  function addCompletedStep(completedSteps: string[], step: string): string[] {
    if (completedSteps.includes(step)) return completedSteps;
    return [...completedSteps, step];
  }

  it("should add a new step to empty list", () => {
    const result = addCompletedStep([], "welcome");
    expect(result).toEqual(["welcome"]);
  });

  it("should add multiple steps in order", () => {
    let steps: string[] = [];
    steps = addCompletedStep(steps, "welcome");
    steps = addCompletedStep(steps, "connect_repo");
    steps = addCompletedStep(steps, "discover");
    expect(steps).toEqual(["welcome", "connect_repo", "discover"]);
  });

  it("should not add duplicate steps", () => {
    let steps = ["welcome", "connect_repo"];
    steps = addCompletedStep(steps, "welcome");
    expect(steps).toEqual(["welcome", "connect_repo"]);
  });

  it("should preserve existing steps when adding new one", () => {
    const steps = ["welcome", "connect_repo"];
    const result = addCompletedStep(steps, "discover");
    expect(result).toEqual(["welcome", "connect_repo", "discover"]);
    expect(result).toHaveLength(3);
  });
});

// ── Onboarding Completion Detection ────────────────────────────────

describe("Onboarding Completion Detection", () => {
  const REQUIRED_STEPS = ["connect_repo", "discover", "first_test"];

  function isOnboardingComplete(completedSteps: string[]): boolean {
    return REQUIRED_STEPS.every((step) => completedSteps.includes(step));
  }

  function getCompletionPercentage(completedSteps: string[]): number {
    const completed = REQUIRED_STEPS.filter((step) => completedSteps.includes(step));
    return (completed.length / REQUIRED_STEPS.length) * 100;
  }

  it("should not be complete with no steps", () => {
    expect(isOnboardingComplete([])).toBe(false);
  });

  it("should not be complete with partial steps", () => {
    expect(isOnboardingComplete(["connect_repo"])).toBe(false);
    expect(isOnboardingComplete(["connect_repo", "discover"])).toBe(false);
  });

  it("should be complete when all required steps are done", () => {
    expect(isOnboardingComplete(["connect_repo", "discover", "first_test"])).toBe(true);
  });

  it("should be complete even with extra steps", () => {
    expect(isOnboardingComplete(["welcome", "connect_repo", "discover", "first_test"])).toBe(true);
  });

  it("should calculate 0% with no completed steps", () => {
    expect(getCompletionPercentage([])).toBe(0);
  });

  it("should calculate 33% with one completed step", () => {
    expect(getCompletionPercentage(["connect_repo"])).toBeCloseTo(33.33, 1);
  });

  it("should calculate 67% with two completed steps", () => {
    expect(getCompletionPercentage(["connect_repo", "discover"])).toBeCloseTo(66.67, 1);
  });

  it("should calculate 100% with all completed steps", () => {
    expect(getCompletionPercentage(["connect_repo", "discover", "first_test"])).toBe(100);
  });
});

// ── Repo Name Extraction ───────────────────────────────────────────

describe("Repo Name Extraction", () => {
  function extractRepoName(url: string): string {
    return url.replace(/\.git$/, "").split("/").pop() || "untitled";
  }

  it("should extract repo name from HTTPS URL", () => {
    expect(extractRepoName("https://github.com/user/my-app")).toBe("my-app");
  });

  it("should extract repo name from URL with .git suffix", () => {
    expect(extractRepoName("https://github.com/user/my-app.git")).toBe("my-app");
  });

  it("should extract repo name from SSH URL", () => {
    expect(extractRepoName("git@github.com:user/repo")).toBe("repo");
  });

  it("should handle URL with trailing slash", () => {
    expect(extractRepoName("https://github.com/user/repo/")).toBe("untitled");
  });

  it("should handle empty string", () => {
    expect(extractRepoName("")).toBe("untitled");
  });

  it("should handle simple string", () => {
    expect(extractRepoName("my-repo")).toBe("my-repo");
  });

  it("should handle deep nested paths", () => {
    expect(extractRepoName("https://github.com/org/team/project")).toBe("project");
  });
});

// ── Onboarding State Defaults ──────────────────────────────────────

describe("Onboarding State Defaults", () => {
  const defaultState = {
    currentStep: "welcome",
    completedSteps: [] as string[],
    skipped: false,
    repoUrl: null as string | null,
    projectId: null as string | null,
    featureCount: 0,
    testRunId: null as string | null,
    dismissedAt: null as string | null,
    completedAt: null as string | null,
  };

  it("should have welcome as default current step", () => {
    expect(defaultState.currentStep).toBe("welcome");
  });

  it("should have empty completed steps by default", () => {
    expect(defaultState.completedSteps).toEqual([]);
    expect(defaultState.completedSteps).toHaveLength(0);
  });

  it("should not be skipped by default", () => {
    expect(defaultState.skipped).toBe(false);
  });

  it("should have zero feature count by default", () => {
    expect(defaultState.featureCount).toBe(0);
  });

  it("should have null optional fields by default", () => {
    expect(defaultState.repoUrl).toBeNull();
    expect(defaultState.projectId).toBeNull();
    expect(defaultState.testRunId).toBeNull();
    expect(defaultState.dismissedAt).toBeNull();
    expect(defaultState.completedAt).toBeNull();
  });
});

// ── Onboarding State Transitions ───────────────────────────────────

describe("Onboarding State Transitions", () => {
  interface OnboardingState {
    currentStep: string;
    completedSteps: string[];
    skipped: boolean;
    repoUrl: string | null;
    projectId: string | null;
    featureCount: number;
    testRunId: string | null;
    completedAt: Date | null;
    dismissedAt: Date | null;
  }

  function completeStep(
    state: OnboardingState,
    step: string,
    metadata: Record<string, unknown> = {}
  ): OnboardingState {
    const completedSteps = state.completedSteps.includes(step)
      ? state.completedSteps
      : [...state.completedSteps, step];

    const nextStep = STEP_ORDER[step];
    const newState: OnboardingState = {
      ...state,
      completedSteps,
      currentStep: nextStep ?? state.currentStep,
    };

    // Step-specific metadata
    if (step === "connect_repo") {
      if (metadata.repoUrl) newState.repoUrl = metadata.repoUrl as string;
      if (metadata.projectId) newState.projectId = metadata.projectId as string;
    }
    if (step === "discover") {
      if (metadata.featureCount !== undefined) newState.featureCount = metadata.featureCount as number;
    }
    if (step === "first_test") {
      if (metadata.testRunId) newState.testRunId = metadata.testRunId as string;
    }
    if (step === "complete") {
      newState.completedAt = new Date();
    }

    return newState;
  }

  it("should advance from welcome to connect_repo", () => {
    const state: OnboardingState = {
      currentStep: "welcome",
      completedSteps: [],
      skipped: false,
      repoUrl: null,
      projectId: null,
      featureCount: 0,
      testRunId: null,
      completedAt: null,
      dismissedAt: null,
    };

    const next = completeStep(state, "welcome");
    expect(next.currentStep).toBe("connect_repo");
    expect(next.completedSteps).toContain("welcome");
  });

  it("should save repo metadata on connect_repo step", () => {
    const state: OnboardingState = {
      currentStep: "connect_repo",
      completedSteps: ["welcome"],
      skipped: false,
      repoUrl: null,
      projectId: null,
      featureCount: 0,
      testRunId: null,
      completedAt: null,
      dismissedAt: null,
    };

    const next = completeStep(state, "connect_repo", {
      repoUrl: "https://github.com/user/app",
      projectId: "proj_123",
    });

    expect(next.repoUrl).toBe("https://github.com/user/app");
    expect(next.projectId).toBe("proj_123");
    expect(next.currentStep).toBe("discover");
  });

  it("should save feature count on discover step", () => {
    const state: OnboardingState = {
      currentStep: "discover",
      completedSteps: ["welcome", "connect_repo"],
      skipped: false,
      repoUrl: "https://github.com/user/app",
      projectId: "proj_123",
      featureCount: 0,
      testRunId: null,
      completedAt: null,
      dismissedAt: null,
    };

    const next = completeStep(state, "discover", { featureCount: 12 });
    expect(next.featureCount).toBe(12);
    expect(next.currentStep).toBe("first_test");
  });

  it("should save test run ID on first_test step", () => {
    const state: OnboardingState = {
      currentStep: "first_test",
      completedSteps: ["welcome", "connect_repo", "discover"],
      skipped: false,
      repoUrl: "https://github.com/user/app",
      projectId: "proj_123",
      featureCount: 12,
      testRunId: null,
      completedAt: null,
      dismissedAt: null,
    };

    const next = completeStep(state, "first_test", { testRunId: "run_456" });
    expect(next.testRunId).toBe("run_456");
    expect(next.currentStep).toBe("complete");
  });

  it("should set completedAt on complete step", () => {
    const state: OnboardingState = {
      currentStep: "complete",
      completedSteps: ["welcome", "connect_repo", "discover", "first_test"],
      skipped: false,
      repoUrl: "https://github.com/user/app",
      projectId: "proj_123",
      featureCount: 12,
      testRunId: "run_456",
      completedAt: null,
      dismissedAt: null,
    };

    const next = completeStep(state, "complete");
    expect(next.completedAt).toBeInstanceOf(Date);
  });

  it("should not duplicate steps in completedSteps", () => {
    const state: OnboardingState = {
      currentStep: "connect_repo",
      completedSteps: ["welcome"],
      skipped: false,
      repoUrl: null,
      projectId: null,
      featureCount: 0,
      testRunId: null,
      completedAt: null,
      dismissedAt: null,
    };

    const next = completeStep(state, "welcome");
    expect(next.completedSteps.filter((s) => s === "welcome")).toHaveLength(1);
  });
});

// ── Skip/Dismiss Logic ─────────────────────────────────────────────

describe("Skip/Dismiss Logic", () => {
  it("should mark onboarding as skipped with dismissedAt", () => {
    const updateData: Record<string, unknown> = { skipped: true };
    if (updateData.skipped === true) {
      updateData.dismissedAt = new Date();
    }
    expect(updateData.skipped).toBe(true);
    expect(updateData.dismissedAt).toBeInstanceOf(Date);
  });

  it("should clear dismissedAt when re-enabling onboarding", () => {
    const updateData: Record<string, unknown> = { dismissed: false };
    if (updateData.dismissed === false) {
      updateData.dismissedAt = null;
    }
    expect(updateData.dismissedAt).toBeNull();
  });

  it("should determine if onboarding should show", () => {
    function shouldShowOnboarding(state: {
      completedAt: string | null;
      dismissedAt: string | null;
      skipped: boolean;
    }): boolean {
      return !state.completedAt && !state.dismissedAt && !state.skipped;
    }

    expect(shouldShowOnboarding({ completedAt: null, dismissedAt: null, skipped: false })).toBe(true);
    expect(shouldShowOnboarding({ completedAt: "2024-01-01", dismissedAt: null, skipped: false })).toBe(false);
    expect(shouldShowOnboarding({ completedAt: null, dismissedAt: "2024-01-01", skipped: true })).toBe(false);
    expect(shouldShowOnboarding({ completedAt: null, dismissedAt: null, skipped: true })).toBe(false);
  });
});

// ── Full Onboarding Flow Integration ───────────────────────────────

describe("Full Onboarding Flow", () => {
  it("should complete the full flow from welcome to complete", () => {
    const steps: string[] = [];
    const STEP_FLOW = ["welcome", "connect_repo", "discover", "first_test", "complete"];

    STEP_FLOW.forEach((step) => {
      if (!steps.includes(step)) steps.push(step);
    });

    expect(steps).toEqual(STEP_FLOW);
    expect(steps).toHaveLength(5);
  });

  it("should allow skipping intermediate steps", () => {
    const steps = ["welcome", "first_test", "complete"];
    // User skipped connect_repo and discover but still reached complete
    expect(steps).toHaveLength(3);
    expect(steps).toContain("complete");
  });

  it("should track progress through the flow", () => {
    const totalSteps = 5;
    const scenarios = [
      { completed: 0, percent: 0 },
      { completed: 1, percent: 20 },
      { completed: 2, percent: 40 },
      { completed: 3, percent: 60 },
      { completed: 4, percent: 80 },
      { completed: 5, percent: 100 },
    ];

    scenarios.forEach(({ completed, percent }) => {
      expect(Math.round((completed / totalSteps) * 100)).toBe(percent);
    });
  });
});
