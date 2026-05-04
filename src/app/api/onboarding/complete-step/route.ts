import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const VALID_STEPS = ["welcome", "connect_repo", "discover", "first_test", "complete"] as const;

const STEP_ORDER: Record<string, string | null> = {
  welcome: "connect_repo",
  connect_repo: "discover",
  discover: "first_test",
  first_test: "complete",
  complete: null,
};

// POST /api/onboarding/complete-step — Mark an onboarding step as completed and auto-advance
// Body: { step: string, repoUrl?, projectId?, featureCount?, testRunId? }
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { step, repoUrl, projectId, featureCount, testRunId } = body;

    // Validate the step value
    if (!step || !VALID_STEPS.includes(step)) {
      return NextResponse.json(
        { error: `Invalid step. Must be one of: ${VALID_STEPS.join(", ")}` },
        { status: 400 }
      );
    }

    // Step-specific metadata validation
    if (step === "connect_repo" && repoUrl !== undefined && typeof repoUrl !== "string") {
      return NextResponse.json(
        { error: "repoUrl must be a string" },
        { status: 400 }
      );
    }

    if (step === "discover" && featureCount !== undefined && typeof featureCount !== "number") {
      return NextResponse.json(
        { error: "featureCount must be a number" },
        { status: 400 }
      );
    }

    if (step === "first_test" && testRunId !== undefined && typeof testRunId !== "string") {
      return NextResponse.json(
        { error: "testRunId must be a string" },
        { status: 400 }
      );
    }

    // Fetch or create the current onboarding state
    let onboarding = await db.onboardingState.findUnique({
      where: { userId: session.user.id },
    });

    if (!onboarding) {
      onboarding = await db.onboardingState.create({
        data: {
          userId: session.user.id,
          currentStep: "welcome",
          completedSteps: [],
          skipped: false,
          featureCount: 0,
        },
      });
    }

    // Add the step to completedSteps if not already present
    const completedSteps = [...onboarding.completedSteps];
    if (!completedSteps.includes(step)) {
      completedSteps.push(step);
    }

    // Build the update data
    const data: Record<string, unknown> = {
      completedSteps,
    };

    // Auto-advance to the next step
    const nextStep = STEP_ORDER[step];
    if (nextStep) {
      data.currentStep = nextStep;
    }

    // Step-specific metadata
    if (step === "connect_repo") {
      if (repoUrl !== undefined) data.repoUrl = repoUrl;
      if (projectId !== undefined) data.projectId = projectId;
    }

    if (step === "discover") {
      if (featureCount !== undefined) data.featureCount = featureCount;
    }

    if (step === "first_test") {
      if (testRunId !== undefined) data.testRunId = testRunId;
    }

    // If completing the final step, set completedAt
    if (step === "complete") {
      data.completedAt = new Date();
    }

    const updated = await db.onboardingState.update({
      where: { id: onboarding.id },
      data,
    });

    return NextResponse.json({ onboarding: updated });
  } catch (error) {
    console.error("Failed to complete onboarding step:", error);
    return NextResponse.json(
      { error: "Failed to complete onboarding step" },
      { status: 500 }
    );
  }
}
