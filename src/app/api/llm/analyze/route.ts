import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyzeCode, analyzeSnippet } from "@/lib/llm/provider";

// POST /api/llm/analyze — Analyze code using LLM
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { code, filename } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "code is required and must be a string" },
        { status: 400 }
      );
    }

    if (code.length > 50000) {
      return NextResponse.json(
        { error: "Code snippet too large. Maximum 50,000 characters." },
        { status: 400 }
      );
    }

    const result = await analyzeSnippet(code, filename);

    return NextResponse.json({ analysis: result });
  } catch (error) {
    console.error("LLM analysis failed:", error);
    return NextResponse.json(
      { error: "Failed to analyze code", details: String(error) },
      { status: 500 }
    );
  }
}
