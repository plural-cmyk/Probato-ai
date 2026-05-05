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

    let onboarding;

    try {
      onboarding = await db.onboardingState.findUnique({
        where: { userId: session.user.id },
      });
    } catch (dbError) {
      console.error("Database query failed for onboarding state:", dbError);
      // Return a default onboarding state if the database table doesn't exist yet
      return NextResponse.json({
        onboarding: {
          id: "pending",
          userId: session.user.id,
          currentStep: "welcome",
          completedSteps: [],
          skipped: false,
          featureCount: 0,
          dismissedAt: null,
          completedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    // Create a default onboarding state if the user doesn't have one yet
    if (!onboarding) {
      try {
        onboarding = await db.onboardingState.create({
          data: {
            userId: session.user.id,
            currentStep: "welcome",
            completedSteps: [],
            skipped: false,
            featureCount: 0,
          },
        });
      } catch (createError) {
        console.error("Failed to create onboarding state:", createError);
        // Return a default state even if creation fails
        return NextResponse.json({
          onboarding: {
            id: "pending",
            userId: session.user.id,
            currentStep: "welcome",
            completedSteps: [],
            skipped: false,
            featureCount: 0,
            dismissedAt: null,
            completedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      }
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

    try {
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
    } catch (dbError) {
      console.error("Database operation failed for onboarding upsert:", dbError);
      // Return the data the client sent, even if DB write failed
      // This prevents the onboarding flow from being blocked
      return NextResponse.json({
        onboarding: {
          id: "pending",
          userId: session.user.id,
          currentStep: (currentStep as string) ?? "welcome",
          completedSteps: (completedSteps as string[]) ?? [],
          skipped: (skipped as boolean) ?? false,
          repoUrl: repoUrl ?? null,
          projectId: projectId ?? null,
          featureCount: (featureCount as number) ?? 0,
          testRunId: testRunId ?? null,
          completedAt: completed === true ? new Date().toISOString() : null,
          dismissedAt: skipped === true ? new Date().toISOString() : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error("Failed to update onboarding state:", error);
    return NextResponse.json(
      { error: "Failed to update onboarding state" },
      { status: 500 }
    );
  }
}
