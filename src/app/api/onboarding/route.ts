import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/onboarding — Retrieve the user's onboarding state
// Creates a default state if one does not exist yet
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let onboarding = await db.onboardingState.findUnique({
      where: { userId: session.user.id },
    });

    // Create a default onboarding state if the user doesn't have one yet
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

    return NextResponse.json({ onboarding });
  } catch (error) {
    console.error("Failed to fetch onboarding state:", error);
    return NextResponse.json(
      { error: "Failed to fetch onboarding state" },
      { status: 500 }
    );
  }
}

// PUT /api/onboarding — Update the user's onboarding state
// Body: { currentStep?, completedSteps?, skipped?, repoUrl?, projectId?, featureCount?, testRunId?, dismissed?, completed? }
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      currentStep,
      completedSteps,
      skipped,
      repoUrl,
      projectId,
      featureCount,
      testRunId,
      dismissed,
      completed,
    } = body;

    // Build the update data object with only the provided fields
    const data: Record<string, unknown> = {};

    if (currentStep !== undefined) data.currentStep = currentStep;
    if (completedSteps !== undefined) data.completedSteps = completedSteps;
    if (skipped !== undefined) data.skipped = skipped;
    if (repoUrl !== undefined) data.repoUrl = repoUrl;
    if (projectId !== undefined) data.projectId = projectId;
    if (featureCount !== undefined) data.featureCount = featureCount;
    if (testRunId !== undefined) data.testRunId = testRunId;

    // If the user is completing onboarding, set completedAt
    if (completed === true) {
      data.completedAt = new Date();
    }

    // If the user is skipping/dismissing onboarding, set dismissedAt
    if (skipped === true) {
      data.dismissedAt = new Date();
    }

    // If dismissed is explicitly set to false, clear dismissedAt
    if (dismissed === false) {
      data.dismissedAt = null;
    }

    const onboarding = await db.onboardingState.upsert({
      where: { userId: session.user.id },
      update: data,
      create: {
        userId: session.user.id,
        currentStep: (currentStep as string) ?? "welcome",
        completedSteps: (completedSteps as string[]) ?? [],
        skipped: (skipped as boolean) ?? false,
        repoUrl: repoUrl as string | null ?? null,
        projectId: projectId as string | null ?? null,
        featureCount: (featureCount as number) ?? 0,
        testRunId: testRunId as string | null ?? null,
        completedAt: completed === true ? new Date() : null,
        dismissedAt: skipped === true ? new Date() : null,
      },
    });

    return NextResponse.json({ onboarding });
  } catch (error) {
    console.error("Failed to update onboarding state:", error);
    return NextResponse.json(
      { error: "Failed to update onboarding state" },
      { status: 500 }
    );
  }
}
