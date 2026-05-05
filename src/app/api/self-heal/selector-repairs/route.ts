/**
 * /api/self-heal/selector-repairs
 * GET:  List selector repairs (filter by testCaseId, status)
 * POST: Create a selector repair (deducts selector_repair 8 credits)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { repairSelector } from "@/lib/agent/self-heal-v2";
import { checkCredits, deductCredits } from "@/lib/billing/credits";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const testCaseId = searchParams.get("testCaseId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const where: Record<string, unknown> = {};
    if (testCaseId) where.testCaseId = testCaseId;
    if (status) where.status = status;

    // Only show repairs for test cases the user has access to
    if (testCaseId) {
      const testCase = await db.testCase.findUnique({
        where: { id: testCaseId },
        include: { feature: { include: { project: true } } },
      });
      if (!testCase || testCase.feature.project.userId !== session.user.id) {
        return NextResponse.json({ error: "Test case not found or access denied" }, { status: 403 });
      }
    } else {
      // Filter to only show repairs from user's projects
      const userProjects = await db.project.findMany({
        where: { userId: session.user.id },
        select: { id: true },
      });
      const projectIds = userProjects.map((p) => p.id);

      const userTestCases = await db.testCase.findMany({
        where: { feature: { projectId: { in: projectIds } } },
        select: { id: true },
      });
      const testCaseIds = userTestCases.map((tc) => tc.id);
      where.testCaseId = { in: testCaseIds };
    }

    const [repairs, total] = await Promise.all([
      db.selectorRepair.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.selectorRepair.count({ where }),
    ]);

    return NextResponse.json({ repairs, total, limit, offset });
  } catch (error: unknown) {
    console.error("List selector repairs error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { testCaseId, oldSelector, newSelector, confidence } = body;

    if (!testCaseId || !oldSelector || !newSelector || confidence === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: testCaseId, oldSelector, newSelector, confidence" },
        { status: 400 }
      );
    }

    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
      return NextResponse.json(
        { error: "Confidence must be a number between 0 and 1" },
        { status: 400 }
      );
    }

    // Verify test case ownership
    const testCase = await db.testCase.findUnique({
      where: { id: testCaseId },
      include: { feature: { include: { project: true } } },
    });
    if (!testCase || testCase.feature.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Test case not found or access denied" }, { status: 403 });
    }

    // Check and deduct credits
    const creditCheck = await checkCredits(session.user.id, "selector_repair");
    if (!creditCheck.hasCredits) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          creditsRequired: creditCheck.required,
          creditsBalance: creditCheck.balance,
        },
        { status: 402 }
      );
    }

    // Create the repair
    const repair = await repairSelector(testCaseId, oldSelector, newSelector, confidence);

    // Deduct credits after successful creation
    const deduction = await deductCredits(
      session.user.id,
      "selector_repair",
      "Selector self-healing repair",
      repair.id,
      "selector_repair"
    );

    return NextResponse.json({
      repair,
      creditsDeducted: deduction.success ? deduction.deducted : 0,
      creditsBalance: deduction.success ? deduction.balanceAfter : creditCheck.balance,
    });
  } catch (error: unknown) {
    console.error("Create selector repair error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
