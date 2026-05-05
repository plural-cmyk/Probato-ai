/**
 * Multi-Device Orchestrator (M25)
 *
 * Provisions, coordinates, and manages multiple browser instances
 * running simultaneously for cross-device test scenarios.
 *
 * Architecture:
 * - Database-backed event bus (SyncEvent) for serverless-safe coordination
 * - Synchronization barriers for multi-agent coordination
 * - 3-tier LLM analysis with fallback
 * - Sequential fallback when memory is constrained
 */

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { checkCredits, deductCredits } from "@/lib/billing/credits";
import { getBrowserInstance, cleanupBrowser } from "@/lib/browser/chromium";
import type { Page, Browser } from "puppeteer-core";

// ── Types ──────────────────────────────────────────────────────

export interface OrchestratorInput {
  projectId?: string;
  userId: string;
  url: string;
  testRunId?: string;
  scenarioType: "messaging" | "call" | "payment" | "custom";
  agents?: AgentConfig[];
  maxConcurrentBrowsers?: number; // default 2
  syncTimeoutMs?: number; // default 30000
}

export interface AgentConfig {
  role: string; // sender, receiver, caller, callee, payer, merchant, observer
  actions: AgentAction[];
  description?: string;
}

export interface AgentAction {
  type: string; // navigate, click, fill, wait, assert, signal, barrier, screenshot, custom
  selector?: string;
  value?: string;
  timeout?: number;
  waitFor?: string; // CSS selector to wait for
  description?: string;
}

export interface AgentResult {
  role: string;
  status: "done" | "error";
  score: number;
  actions: ActionResult[];
  errorLog?: string;
  screenshotUrl?: string;
}

export interface ActionResult {
  type: string;
  status: "passed" | "failed" | "skipped";
  duration: number; // ms
  error?: string;
  evidence?: string; // screenshot or text evidence
}

export interface SyncEventPayload {
  barrierName?: string;
  signalType?: string;
  stateKey?: string;
  stateValue?: unknown;
  error?: string;
}

export interface OrchestratorResult {
  sessionId: string;
  status: "completed" | "failed";
  overallScore: number;
  agentResults: Record<string, AgentResult>;
  findings: Finding[];
  recommendations: string[];
  summary: string;
  llmUsed: boolean;
  duration: number;
  error?: string;
}

export interface Finding {
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  agents: string[];
  evidence?: string;
  recommendation?: string;
}

// ── Main Orchestrator Function ─────────────────────────────────

export async function runOrchestratedSession(
  input: OrchestratorInput
): Promise<OrchestratorResult> {
  const startTime = Date.now();
  const emptyResult = (): OrchestratorResult => ({
    sessionId: "",
    status: "failed",
    overallScore: 0,
    agentResults: {},
    findings: [],
    recommendations: [],
    summary: "",
    llmUsed: false,
    duration: Date.now() - startTime,
    error: "Session failed to initialize",
  });

  // 1. Check credits
  const creditCheck = await checkCredits(input.userId, "orchestrated_test");
  if (!creditCheck.hasSufficient) {
    return {
      ...emptyResult(),
      error: `Insufficient credits. Need 12, have ${creditCheck.balance}.`,
    };
  }

  // 2. Create session record
  let session;
  try {
    session = await db.orchestratedSession.create({
      data: {
        scenarioType: input.scenarioType,
        url: input.url,
        status: "running",
        config: {
          agents: input.agents?.map((a) => ({ role: a.role, description: a.description })) ?? [],
          maxConcurrentBrowsers: input.maxConcurrentBrowsers ?? 2,
          syncTimeoutMs: input.syncTimeoutMs ?? 30000,
        },
        startedAt: new Date(),
        userId: input.userId,
        projectId: input.projectId ?? null,
        testRunId: input.testRunId ?? null,
      },
    });
  } catch (err: unknown) {
    return { ...emptyResult(), error: `Failed to create session: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 3. Determine agents based on scenario type
  const agents = input.agents ?? getDefaultAgents(input.scenarioType);

  // 4. Create sandbox instances
  const sandboxIds: string[] = [];
  for (const agent of agents) {
    try {
      const sandbox = await db.sandboxInstance.create({
        data: {
          sessionId: session.id,
          agentRole: agent.role,
          status: "provisioning",
          actions: agent.actions,
        },
      });
      sandboxIds.push(sandbox.id);
    } catch (err: unknown) {
      await updateSessionFailed(session.id, `Failed to create sandbox for ${agent.role}: ${err instanceof Error ? err.message : String(err)}`);
      return { ...emptyResult(), sessionId: session.id, error: `Sandbox creation failed for ${agent.role}` };
    }
  }

  // 5. Execute orchestrated test
  const agentResults: Record<string, AgentResult> = {};
  let llmUsed = false;
  let findings: Finding[] = [];

  try {
    const maxConcurrent = input.maxConcurrentBrowsers ?? 2;

    if (maxConcurrent >= agents.length) {
      // Run all agents in parallel
      const results = await runAgentsParallel(
        session.id,
        agents,
        sandboxIds,
        input.url,
        input.syncTimeoutMs ?? 30000
      );
      Object.assign(agentResults, results);
    } else {
      // Run in batches with sequential fallback
      const batches = batchAgents(agents, sandboxIds, maxConcurrent);
      for (const batch of batches) {
        const results = await runAgentsParallel(
          session.id,
          batch.agents,
          batch.sandboxIds,
          input.url,
          input.syncTimeoutMs ?? 30000
        );
        Object.assign(agentResults, results);
      }
    }

    // 6. Aggregate results and score
    const overallScore = calculateOverallScore(agentResults);

    // 7. LLM analysis
    let summary = "";
    let llmFindings: Finding[] = [];
    let recommendations: string[] = generateRecommendations(agentResults);

    try {
      const llmResult = await callLLMForAnalysis(input.url, input.scenarioType, agentResults);
      summary = llmResult.summary;
      llmFindings = llmResult.findings;
      recommendations = [...recommendations, ...llmResult.recommendations];
      llmUsed = true;
    } catch {
      summary = generateRuleBasedSummary(input.scenarioType, agentResults);
    }

    findings = [...extractFindingsFromResults(agentResults), ...llmFindings];

    // 8. Deduct credits
    await deductCredits(input.userId, "orchestrated_test", session.id, "orchestrated_session");

    // 9. Update session
    const duration = Date.now() - startTime;
    await db.orchestratedSession.update({
      where: { id: session.id },
      data: {
        status: "completed",
        overallScore,
        agentResults: agentResults,
        summary,
        findings,
        recommendations,
        llmUsed,
        duration,
        completedAt: new Date(),
      },
    });

    // 10. Update sandbox scores
    for (const [role, result] of Object.entries(agentResults)) {
      const sandbox = await db.sandboxInstance.findFirst({
        where: { sessionId: session.id, agentRole: role },
      });
      if (sandbox) {
        await db.sandboxInstance.update({
          where: { id: sandbox.id },
          data: {
            status: result.status === "done" ? "done" : "error",
            score: result.score,
            results: result.actions,
            errorLog: result.errorLog,
            screenshotUrl: result.screenshotUrl,
            completedAt: new Date(),
          },
        });
      }
    }

    return {
      sessionId: session.id,
      status: "completed",
      overallScore,
      agentResults,
      findings,
      recommendations,
      summary,
      llmUsed,
      duration,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await updateSessionFailed(session.id, errorMsg);
    return {
      ...emptyResult(),
      sessionId: session.id,
      agentResults,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

// ── Parallel Agent Execution ───────────────────────────────────

async function runAgentsParallel(
  sessionId: string,
  agents: AgentConfig[],
  sandboxIds: string[],
  url: string,
  syncTimeoutMs: number
): Promise<Record<string, AgentResult>> {
  const results: Record<string, AgentResult> = {};

  // Signal all agents that the session is ready
  for (const agent of agents) {
    await signalEvent(sessionId, "signal", agent.role, null, {
      signalType: "session_ready",
    });
  }

  // Launch browser instances and run agents concurrently
  const promises = agents.map(async (agent, index) => {
    const sandboxId = sandboxIds[index];
    return runSingleAgent(sessionId, sandboxId, agent, url, syncTimeoutMs);
  });

  const settled = await Promise.allSettled(promises);

  for (let i = 0; i < agents.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      results[agents[i].role] = result.value;
    } else {
      results[agents[i].role] = {
        role: agents[i].role,
        status: "error",
        score: 0,
        actions: [],
        errorLog: result.reason?.message ?? "Unknown error",
      };
    }
  }

  return results;
}

async function runSingleAgent(
  sessionId: string,
  sandboxId: string,
  agent: AgentConfig,
  url: string,
  syncTimeoutMs: number
): Promise<AgentResult> {
  let browser: Browser | null = null;
  let page: Page | null = null;
  const actionResults: ActionResult[] = [];
  let score = 100;

  try {
    // Update sandbox status
    await db.sandboxInstance.update({
      where: { id: sandboxId },
      data: { status: "provisioning" },
    });

    // Launch browser
    const browserResult = await getBrowserInstance();
    browser = browserResult.browser;
    page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Update sandbox to ready
    await db.sandboxInstance.update({
      where: { id: sandboxId },
      data: { status: "ready", browserId: `browser-${sandboxId.slice(-8)}`, startedAt: new Date() },
    });

    // Wait for all agents to be ready (barrier)
    await barrier(sessionId, "all_agents_ready", syncTimeoutMs);

    // Execute actions
    await db.sandboxInstance.update({
      where: { id: sandboxId },
      data: { status: "running" },
    });

    for (const action of agent.actions) {
      const actionStart = Date.now();
      try {
        const result = await executeAction(page, action, sessionId, agent.role, syncTimeoutMs);
        actionResults.push({
          type: action.type,
          status: "passed",
          duration: Date.now() - actionStart,
          evidence: result.evidence,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        actionResults.push({
          type: action.type,
          status: "failed",
          duration: Date.now() - actionStart,
          error: errorMsg,
        });
        score = Math.max(0, score - 10);
      }
    }

    // Take final screenshot
    let screenshotUrl: string | undefined;
    try {
      const screenshot = await page.screenshot({ encoding: "base64" });
      screenshotUrl = `data:image/png;base64,${screenshot}`;
    } catch { /* ignore screenshot failure */ }

    // Signal completion
    await signalEvent(sessionId, "signal", agent.role, null, {
      signalType: "agent_completed",
      stateKey: `${agent.role}.score`,
      stateValue: score,
    });

    return {
      role: agent.role,
      status: "done",
      score,
      actions: actionResults,
      screenshotUrl,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      role: agent.role,
      status: "error",
      score: 0,
      actions: actionResults,
      errorLog: errorMsg,
    };
  } finally {
    // Cleanup browser
    try {
      if (page) await page.close();
      if (browser) await cleanupBrowser(browser);
    } catch { /* ignore cleanup errors */ }

    // Update sandbox
    await db.sandboxInstance.update({
      where: { id: sandboxId },
      data: { completedAt: new Date() },
    }).catch(() => {});
  }
}

// ── Action Execution ───────────────────────────────────────────

async function executeAction(
  page: Page,
  action: AgentAction,
  sessionId: string,
  agentRole: string,
  syncTimeoutMs: number
): Promise<{ evidence?: string }> {
  switch (action.type) {
    case "navigate": {
      await page.goto(action.value!, { waitUntil: "networkidle2", timeout: action.timeout ?? 15000 });
      return { evidence: `Navigated to ${action.value}` };
    }
    case "click": {
      const el = await page.waitForSelector(action.selector!, { timeout: action.timeout ?? 5000 });
      await el!.click();
      return { evidence: `Clicked ${action.selector}` };
    }
    case "fill": {
      const el = await page.waitForSelector(action.selector!, { timeout: action.timeout ?? 5000 });
      await el!.click({ clickCount: 3 }); // select all
      await el!.type(action.value!, { delay: 50 });
      return { evidence: `Filled ${action.selector} with "${action.value?.substring(0, 50)}"` };
    }
    case "wait": {
      if (action.selector) {
        await page.waitForSelector(action.selector, { timeout: action.timeout ?? 10000 });
        return { evidence: `Waited for ${action.selector}` };
      }
      await new Promise((r) => setTimeout(r, action.timeout ?? 1000));
      return { evidence: `Waited ${action.timeout ?? 1000}ms` };
    }
    case "assert": {
      const content = await page.content();
      if (action.value && !content.includes(action.value)) {
        throw new Error(`Assertion failed: page does not contain "${action.value}"`);
      }
      if (action.selector) {
        const el = await page.$(action.selector);
        if (!el) throw new Error(`Assertion failed: element "${action.selector}" not found`);
      }
      return { evidence: `Asserted ${action.selector ?? `contains "${action.value}"`}` };
    }
    case "screenshot": {
      const screenshot = await page.screenshot({ encoding: "base64" });
      return { evidence: `Screenshot taken (${(screenshot as string).length} chars)` };
    }
    case "barrier": {
      await barrier(sessionId, action.value ?? "unnamed", syncTimeoutMs);
      return { evidence: `Barrier "${action.value}" reached` };
    }
    case "signal": {
      await signalEvent(sessionId, "signal", agentRole, action.selector ?? null, {
        signalType: action.value ?? "custom",
      });
      return { evidence: `Signal "${action.value}" sent` };
    }
    case "waitForSignal": {
      const event = await waitForEvent(sessionId, "signal", action.selector ?? undefined, syncTimeoutMs);
      return { evidence: `Signal received: ${JSON.stringify(event?.payload ?? {})}` };
    }
    case "custom": {
      // Delegate messaging-specific custom actions to M26 handler
      if (["send_message", "verify_message_received", "check_notification_badge",
           "wait_for_notification", "dismiss_notification", "verify_delivery_receipt",
           "verify_typing_indicator", "open_conversation", "verify_online_status",
           "check_push_notification"].includes(action.value ?? "")) {
        try {
          const { handleMessagingCustomAction } = await import("@/lib/agent/messaging-tester");
          return await handleMessagingCustomAction(page, action, sessionId, agentRole, syncTimeoutMs);
        } catch (err: unknown) {
          return { evidence: `Messaging action fallback: ${action.value} — ${err instanceof Error ? err.message : String(err)}` };
        }
      }
      // Delegate call flow-specific custom actions to M27 handler
      if (["dial", "answer", "hangup", "verify_ring", "verify_incoming_call",
           "verify_call_connected", "verify_call_ended", "verify_call_timer",
           "verify_call_quality", "verify_audio_indicator", "toggle_mute",
           "toggle_speaker", "toggle_video"].includes(action.value ?? "")) {
        try {
          const { handleCallCustomAction } = await import("@/lib/agent/call-flow-tester");
          return await handleCallCustomAction(page, action, sessionId, agentRole, syncTimeoutMs);
        } catch (err: unknown) {
          return { evidence: `Call flow action fallback: ${action.value} — ${err instanceof Error ? err.message : String(err)}` };
        }
      }
      // Generic custom action fallback for M28+
      return { evidence: `Custom action: ${action.description ?? action.value ?? "undefined"}` };
    }
    default: {
      return { evidence: `Unknown action type: ${action.type}` };
    }
  }
}

// ── Synchronization Primitives ─────────────────────────────────

async function signalEvent(
  sessionId: string,
  eventType: string,
  sourceAgent: string,
  targetAgent: string | null,
  payload: SyncEventPayload
): Promise<void> {
  await db.syncEvent.create({
    data: {
      sessionId,
      eventType,
      sourceAgent,
      targetAgent,
      payload,
    },
  });
}

async function waitForEvent(
  sessionId: string,
  eventType: string,
  targetAgent?: string,
  timeoutMs: number = 30000
): Promise<{ payload: SyncEventPayload } | null> {
  const deadline = Date.now() + timeoutMs;
  let interval = 200; // start polling at 200ms

  while (Date.now() < deadline) {
    const event = await db.syncEvent.findFirst({
      where: {
        sessionId,
        eventType,
        consumed: false,
        ...(targetAgent ? { targetAgent } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    if (event) {
      await db.syncEvent.update({
        where: { id: event.id },
        data: { consumed: true, consumedAt: new Date() },
      });
      return { payload: event.payload as SyncEventPayload };
    }

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval * 1.5, 2000); // exponential backoff, max 2s
  }

  return null; // timeout
}

async function barrier(
  sessionId: string,
  barrierName: string,
  timeoutMs: number = 30000
): Promise<void> {
  // Get session config to know how many agents
  const session = await db.orchestratedSession.findUnique({
    where: { id: sessionId },
    include: { sandboxes: true },
  });

  if (!session) throw new Error(`Session ${sessionId} not found`);
  const agentCount = session.sandboxes.length;

  // Signal our arrival
  await db.syncEvent.create({
    data: {
      sessionId,
      eventType: "barrier",
      sourceAgent: `barrier_${barrierName}`,
      targetAgent: null,
      payload: { barrierName, agentArrived: true },
    },
  });

  // Wait for all agents to arrive
  const deadline = Date.now() + timeoutMs;
  let interval = 200;

  while (Date.now() < deadline) {
    const arrivals = await db.syncEvent.count({
      where: {
        sessionId,
        eventType: "barrier",
        sourceAgent: `barrier_${barrierName}`,
        payload: { path: ["barrierName"], equals: barrierName },
      },
    });

    if (arrivals >= agentCount) {
      // All agents arrived — release the barrier
      await db.syncEvent.create({
        data: {
          sessionId,
          eventType: "release",
          sourceAgent: "orchestrator",
          targetAgent: null,
          payload: { barrierName },
        },
      });
      return;
    }

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval * 1.5, 2000);
  }

  throw new Error(`Barrier "${barrierName}" timed out after ${timeoutMs}ms`);
}

// ── LLM Analysis ───────────────────────────────────────────────

async function callLLMForAnalysis(
  url: string,
  scenarioType: string,
  agentResults: Record<string, AgentResult>
): Promise<{ summary: string; findings: Finding[]; recommendations: string[] }> {
  // Tier 1: z-ai-web-dev-sdk
  try {
    const zai = await ZAI.create();
    const prompt = `Analyze the following multi-device orchestrated test results for ${url} (scenario: ${scenarioType}).

Agent Results:
${JSON.stringify(agentResults, null, 2)}

Provide a JSON response with:
1. "summary": A 2-3 sentence summary of the overall test outcome
2. "findings": Array of {type, severity (critical/high/medium/low/info), title, description, agents[], recommendation}
3. "recommendations": Array of actionable recommendation strings

Focus on: cross-device coordination issues, synchronization failures, timing problems, and functional correctness.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a multi-device testing analyst. Always respond with valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary ?? "",
        findings: parsed.findings ?? [],
        recommendations: parsed.recommendations ?? [],
      };
    }
  } catch { /* fall through to tier 2 */ }

  // Tier 2: External API (if configured)
  const externalUrl = process.env.LLM_EXTERNAL_API_URL;
  const externalKey = process.env.LLM_EXTERNAL_API_KEY;
  if (externalUrl && externalKey) {
    try {
      const response = await fetch(externalUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${externalKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a multi-device testing analyst. Always respond with valid JSON." },
            { role: "user", content: `Analyze multi-device test results for ${url} (${scenarioType}): ${JSON.stringify(agentResults)}` },
          ],
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary ?? "",
          findings: parsed.findings ?? [],
          recommendations: parsed.recommendations ?? [],
        };
      }
    } catch { /* fall through to rule-based */ }
  }

  // Tier 3: Rule-based fallback
  return {
    summary: generateRuleBasedSummary(scenarioType, agentResults),
    findings: extractFindingsFromResults(agentResults),
    recommendations: generateRecommendations(agentResults),
  };
}

// ── Scoring & Analysis Helpers ─────────────────────────────────

function calculateOverallScore(agentResults: Record<string, AgentResult>): number {
  const results = Object.values(agentResults);
  if (results.length === 0) return 0;

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const avgScore = totalScore / results.length;

  // Penalty for any agent errors
  const errorCount = results.filter((r) => r.status === "error").length;
  const errorPenalty = errorCount * 10;

  return Math.max(0, Math.min(100, Math.round(avgScore - errorPenalty)));
}

function extractFindingsFromResults(agentResults: Record<string, AgentResult>): Finding[] {
  const findings: Finding[] = [];

  for (const [role, result] of Object.entries(agentResults)) {
    if (result.status === "error") {
      findings.push({
        type: "agent_error",
        severity: "high",
        title: `Agent ${role} failed`,
        description: result.errorLog ?? "Unknown error",
        agents: [role],
        recommendation: "Review the error log and check browser connectivity.",
      });
    }

    const failedActions = result.actions.filter((a) => a.status === "failed");
    for (const action of failedActions) {
      findings.push({
        type: "action_failure",
        severity: "medium",
        title: `Action "${action.type}" failed for agent ${role}`,
        description: action.error ?? "Action execution failed",
        agents: [role],
        recommendation: "Verify the selector and action configuration.",
      });
    }

    // High failure rate
    const totalActions = result.actions.length;
    const failRate = totalActions > 0 ? failedActions.length / totalActions : 0;
    if (failRate > 0.5 && totalActions > 2) {
      findings.push({
        type: "high_failure_rate",
        severity: "high",
        title: `Agent ${role} has high failure rate (${Math.round(failRate * 100)}%)`,
        description: `${failedActions.length} of ${totalActions} actions failed.`,
        agents: [role],
        recommendation: "Check the target application for issues or update the test scenario.",
      });
    }
  }

  // Cross-agent findings
  const agentRoles = Object.keys(agentResults);
  if (agentRoles.length >= 2) {
    const allCompleted = Object.values(agentResults).every((r) => r.status === "done");
    if (!allCompleted) {
      findings.push({
        type: "coordination_issue",
        severity: "high",
        title: "Not all agents completed successfully",
        description: `Only ${Object.values(agentResults).filter((r) => r.status === "done").length} of ${agentRoles.length} agents completed.`,
        agents: agentRoles,
        recommendation: "Review synchronization points and agent configurations.",
      });
    }
  }

  return findings;
}

function generateRecommendations(agentResults: Record<string, AgentResult>): string[] {
  const recs: string[] = [];
  const results = Object.values(agentResults);

  const hasErrors = results.some((r) => r.status === "error");
  if (hasErrors) {
    recs.push("Review browser instance provisioning and connectivity for failed agents.");
  }

  const avgScore = results.length > 0 ? results.reduce((s, r) => s + r.score, 0) / results.length : 0;
  if (avgScore < 50) {
    recs.push("Overall scores are low — consider simplifying the test scenario or checking the target application health.");
  }

  const highFailRate = results.some((r) => {
    const total = r.actions.length;
    return total > 0 && r.actions.filter((a) => a.status === "failed").length / total > 0.5;
  });
  if (highFailRate) {
    recs.push("High action failure rate detected — verify selectors are correct and the target application is stable.");
  }

  if (recs.length === 0) {
    recs.push("All agents completed successfully with good scores. No immediate actions required.");
  }

  return recs;
}

function generateRuleBasedSummary(
  scenarioType: string,
  agentResults: Record<string, AgentResult>
): string {
  const results = Object.values(agentResults);
  const completed = results.filter((r) => r.status === "done").length;
  const total = results.length;
  const avgScore = total > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / total) : 0;

  return `Multi-device ${scenarioType} test completed with ${completed}/${total} agents successful. ` +
    `Average score: ${avgScore}/100. ` +
    `${avgScore >= 80 ? "Overall performance is good." : avgScore >= 50 ? "Some issues detected — review findings." : "Significant issues detected — investigation recommended."}`;
}

// ── Default Agent Configs ──────────────────────────────────────

function getDefaultAgents(scenarioType: string): AgentConfig[] {
  switch (scenarioType) {
    case "messaging":
      return [
        {
          role: "sender",
          actions: [
            { type: "navigate", value: "{{url}}", description: "Navigate to chat app" },
            { type: "barrier", value: "chat_ready", description: "Wait for both agents to be in chat" },
            { type: "custom", value: "send_message", description: "Send a test message" },
            { type: "signal", value: "message_sent", description: "Signal message sent" },
            { type: "waitForSignal", selector: "receiver", description: "Wait for receipt confirmation" },
          ],
          description: "Agent that sends messages in a chat application",
        },
        {
          role: "receiver",
          actions: [
            { type: "navigate", value: "{{url}}", description: "Navigate to chat app" },
            { type: "barrier", value: "chat_ready", description: "Wait for both agents to be in chat" },
            { type: "waitForSignal", selector: "receiver", description: "Wait for sender's message" },
            { type: "custom", value: "verify_message", description: "Verify received message content" },
            { type: "signal", value: "message_received", description: "Signal message received" },
          ],
          description: "Agent that receives and verifies messages",
        },
      ];
    case "call":
      return [
        {
          role: "caller",
          actions: [
            { type: "navigate", value: "{{url}}", description: "Navigate to call app" },
            { type: "barrier", value: "call_ready", description: "Wait for both agents" },
            { type: "custom", value: "dial", description: "Initiate a call" },
            { type: "signal", value: "call_dialed", description: "Signal call dialed" },
            { type: "waitForSignal", selector: "caller", description: "Wait for answer" },
          ],
          description: "Agent that initiates calls",
        },
        {
          role: "callee",
          actions: [
            { type: "navigate", value: "{{url}}", description: "Navigate to call app" },
            { type: "barrier", value: "call_ready", description: "Wait for both agents" },
            { type: "waitForSignal", selector: "callee", description: "Wait for incoming call" },
            { type: "custom", value: "answer", description: "Answer the call" },
            { type: "signal", value: "call_answered", description: "Signal call answered" },
          ],
          description: "Agent that receives and answers calls",
        },
      ];
    case "payment":
      return [
        {
          role: "payer",
          actions: [
            { type: "navigate", value: "{{url}}", description: "Navigate to checkout" },
            { type: "custom", value: "add_to_cart", description: "Add item to cart" },
            { type: "custom", value: "proceed_to_checkout", description: "Go to checkout" },
            { type: "custom", value: "fill_payment", description: "Fill payment details" },
            { type: "custom", value: "submit_payment", description: "Submit payment" },
            { type: "assert", value: "Order", description: "Verify order confirmation" },
          ],
          description: "Agent that completes a payment checkout flow",
        },
      ];
    default:
      return [
        {
          role: "agent_a",
          actions: [
            { type: "navigate", value: "{{url}}", description: "Navigate to target" },
            { type: "barrier", value: "both_ready", description: "Sync point" },
            { type: "screenshot", description: "Capture final state" },
          ],
          description: "Generic test agent A",
        },
        {
          role: "agent_b",
          actions: [
            { type: "navigate", value: "{{url}}", description: "Navigate to target" },
            { type: "barrier", value: "both_ready", description: "Sync point" },
            { type: "screenshot", description: "Capture final state" },
          ],
          description: "Generic test agent B",
        },
      ];
  }
}

// ── Utility Functions ──────────────────────────────────────────

function batchAgents(
  agents: AgentConfig[],
  sandboxIds: string[],
  batchSize: number
): { agents: AgentConfig[]; sandboxIds: string[] }[] {
  const batches: { agents: AgentConfig[]; sandboxIds: string[] }[] = [];
  for (let i = 0; i < agents.length; i += batchSize) {
    batches.push({
      agents: agents.slice(i, i + batchSize),
      sandboxIds: sandboxIds.slice(i, i + batchSize),
    });
  }
  return batches;
}

async function updateSessionFailed(sessionId: string, error: string): Promise<void> {
  try {
    await db.orchestratedSession.update({
      where: { id: sessionId },
      data: {
        status: "failed",
        error,
        completedAt: new Date(),
      },
    });
  } catch { /* ignore */ }
}

// ── Session Abort ──────────────────────────────────────────────

export async function abortOrchestratedSession(
  sessionId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await db.orchestratedSession.findUnique({
      where: { id: sessionId },
      include: { sandboxes: true },
    });

    if (!session) return { success: false, error: "Session not found" };
    if (session.userId !== userId) return { success: false, error: "Unauthorized" };
    if (session.status !== "running") return { success: false, error: `Session is ${session.status}, not running` };

    // Update all sandboxes to error
    await db.sandboxInstance.updateMany({
      where: { sessionId },
      data: { status: "error", errorLog: "Session aborted by user", completedAt: new Date() },
    });

    // Update session
    await db.orchestratedSession.update({
      where: { id: sessionId },
      data: {
        status: "aborted",
        error: "Session aborted by user",
        completedAt: new Date(),
      },
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
