import ZAI from "z-ai-web-dev-sdk";

// LRU Cache for analysis results
const analysisCache = new Map<string, { result: AnalysisResult; timestamp: number }>();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export interface AnalysisResult {
  summary: string;
  language: string;
  framework: string;
  components: ComponentInfo[];
  routes: RouteInfo[];
  features: FeatureInfo[];
  dependencies: string[];
  suggestions: string[];
}

export interface ComponentInfo {
  name: string;
  type: "page" | "component" | "layout" | "form" | "api";
  file?: string;
  description: string;
  selectors?: string[];
}

export interface RouteInfo {
  path: string;
  method?: string;
  description: string;
  params?: string[];
}

export interface FeatureInfo {
  name: string;
  type: "auth" | "crud" | "navigation" | "form" | "api" | "visualization" | "realtime" | "other";
  description: string;
  testPriority: number; // 1 = highest
  dependencies?: string[];
}

/**
 * Analyze code using the LLM provider with structured output
 */
export async function analyzeCode(
  code: string,
  filename?: string
): Promise<AnalysisResult> {
  // Check cache first
  const cacheKey = `${filename ?? ""}:${hashCode(code)}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  // Call the LLM
  const prompt = buildAnalysisPrompt(code, filename);
  const result = await callLLM(prompt);

  // Cache the result
  if (analysisCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = analysisCache.keys().next().value;
    if (oldestKey) analysisCache.delete(oldestKey);
  }
  analysisCache.set(cacheKey, { result, timestamp: Date.now() });

  return result;
}

/**
 * Build the analysis prompt for the LLM
 */
function buildAnalysisPrompt(code: string, filename?: string): string {
  return `You are an expert code analyzer for a testing platform called Probato. Analyze the following code and return a structured JSON response.

${filename ? `File: ${filename}` : ""}

Code:
\`\`\`
${code}
\`\`\`

Return a JSON object with exactly this structure:
{
  "summary": "One paragraph summary of what this code does",
  "language": "The primary programming language",
  "framework": "The framework used (e.g., Next.js, React, Express, FastAPI, or 'none')",
  "components": [
    {
      "name": "ComponentOrFunctionName",
      "type": "page|component|layout|form|api",
      "file": "${filename ?? "unknown"}",
      "description": "What this component/function does",
      "selectors": ["CSS selectors or data-testid that could be used to test this component"]
    }
  ],
  "routes": [
    {
      "path": "/api/example",
      "method": "GET",
      "description": "What this route does",
      "params": ["query params or path params"]
    }
  ],
  "features": [
    {
      "name": "Feature Name",
      "type": "auth|crud|navigation|form|api|visualization|realtime|other",
      "description": "What this feature does from a user perspective",
      "testPriority": 1,
      "dependencies": ["other feature names this depends on"]
    }
  ],
  "dependencies": ["list of external packages/libraries used"],
  "suggestions": ["list of test scenarios that should be generated"]
}

Rules:
- testPriority: 1 = critical (auth, payment), 2 = important (core features), 3 = nice-to-have (UI polish)
- selectors: only include if the code has UI elements with testable IDs or classes
- routes: only include API routes or page routes that exist in the code
- features: think about what a USER would want to test, not implementation details
- Be specific and accurate — this will be used to generate Playwright tests
- Return ONLY the JSON, no markdown or explanation`;
}

/**
 * Call the LLM — tries z-ai-web-dev-sdk first, falls back to external API
 */
async function callLLM(prompt: string): Promise<AnalysisResult> {
  // Strategy 1: Try z-ai-web-dev-sdk (works in dev environment)
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert code analyzer. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const jsonStr = extractJSON(content);
    const result = JSON.parse(jsonStr) as AnalysisResult;
    return result;
  } catch (sdkError) {
    console.warn("z-ai-web-dev-sdk failed, trying external API:", sdkError);
  }

  // Strategy 2: Try external OpenAI-compatible API (for Vercel production)
  const externalUrl = process.env.LLM_API_URL;
  const externalKey = process.env.LLM_API_KEY;
  const externalModel = process.env.LLM_MODEL || "gpt-4o-mini";

  if (externalUrl && externalKey) {
    try {
      const response = await fetch(`${externalUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${externalKey}`,
        },
        body: JSON.stringify({
          model: externalModel,
          messages: [
            {
              role: "system",
              content:
                "You are an expert code analyzer. Always respond with valid JSON only. No markdown, no explanations, just the JSON object.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 4000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? "";
        const jsonStr = extractJSON(content);
        const result = JSON.parse(jsonStr) as AnalysisResult;
        return result;
      } else {
        console.error("External API error:", response.status, await response.text());
      }
    } catch (fetchError) {
      console.error("External API fetch failed:", fetchError);
    }
  }

  // Strategy 3: Rule-based fallback analysis (no LLM needed)
  return fallbackAnalysis(prompt);
}

/**
 * Extract JSON from a string that might contain markdown code blocks
 */
function extractJSON(text: string): string {
  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  throw new Error("No JSON found in LLM response");
}

/**
 * Simple hash function for cache keys
 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Fallback: Rule-based analysis when no LLM is available
 * Parses the code string to find basic patterns
 */
function fallbackAnalysis(prompt: string): AnalysisResult {
  // Extract the code from the prompt
  const codeMatch = prompt.match(/```\n?([\s\S]*?)\n?```/);
  const code = codeMatch ? codeMatch[1] : "";

  const components: ComponentInfo[] = [];
  const routes: RouteInfo[] = [];
  const features: FeatureInfo[] = [];
  const dependencies: string[] = [];
  const suggestions: string[] = [];

  // Detect language
  let language = "unknown";
  let framework = "none";
  if (code.includes("import React") || code.includes("from 'react'") || code.includes('from "react"')) {
    language = "TypeScript";
    dependencies.push("react");
  }
  if (code.includes("export default function") || code.includes("export function")) {
    language = language === "unknown" ? "JavaScript" : language;
  }
  if (code.includes("useState") || code.includes("useEffect")) {
    dependencies.push("react");
  }
  if (code.includes("next") || code.includes("Next")) {
    framework = "Next.js";
    dependencies.push("next");
  }

  // Detect components
  const funcCompMatch = code.match(/export\s+default\s+function\s+(\w+)/);
  if (funcCompMatch) {
    const name = funcCompMatch[1];
    components.push({
      name,
      type: "component",
      description: `React component: ${name}`,
    });

    features.push({
      name: name,
      type: "other",
      description: `The ${name} component's core functionality`,
      testPriority: 2,
    });
  }

  // Detect data-testid selectors
  const testIdMatches = code.matchAll(/data-testid=["']([^"']+)["']/g);
  const selectors: string[] = [];
  for (const match of testIdMatches) {
    selectors.push(`[data-testid="${match[1]}"]`);
  }
  if (components.length > 0 && selectors.length > 0) {
    components[0].selectors = selectors;
  }

  // Detect forms
  if (code.includes("<form") || code.includes("onSubmit")) {
    features.push({
      name: "Form Submission",
      type: "form",
      description: "User can submit a form",
      testPriority: 1,
    });
    suggestions.push("Test form submission with valid and invalid inputs");
    suggestions.push("Test form validation behavior");
  }

  // Detect API routes
  const apiRouteMatch = code.match(/(?:GET|POST|PUT|DELETE|PATCH)\s*\(/g);
  if (apiRouteMatch) {
    routes.push({
      path: "/api/endpoint",
      method: "GET",
      description: "API endpoint detected in code",
    });
    features.push({
      name: "API Integration",
      type: "api",
      description: "The component interacts with an API",
      testPriority: 2,
    });
  }

  // Detect event handlers
  if (code.includes("onClick") || code.includes("onChange")) {
    suggestions.push("Test click interactions and user events");
  }

  // Detect state management
  if (code.includes("useState")) {
    features.push({
      name: "State Management",
      type: "other",
      description: "Component manages internal state",
      testPriority: 2,
    });
    suggestions.push("Test state changes render correctly");
  }

  // Extract import dependencies
  const importMatches = code.matchAll(/from\s+['"]([^'"]+)['"]/g);
  for (const match of importMatches) {
    const dep = match[1];
    if (!dep.startsWith(".") && !dependencies.includes(dep)) {
      dependencies.push(dep);
    }
  }

  const summary = components.length > 0
    ? `A ${framework !== "none" ? framework : ""} ${language} component (${components.map(c => c.name).join(", ")}) with ${features.length} testable feature(s).`
    : `A ${language} code snippet. ${features.length > 0 ? `Found ${features.length} testable feature(s).` : "No obvious testable features detected."}`;

  if (suggestions.length === 0) {
    suggestions.push("Consider adding data-testid attributes for better test targeting");
    suggestions.push("Test the component renders without errors");
    suggestions.push("Test user interactions with the component");
  }

  return {
    summary,
    language: language || "unknown",
    framework: framework || "none",
    components,
    routes,
    features,
    dependencies: [...new Set(dependencies)],
    suggestions,
  };
}

/**
 * Analyze a simple code snippet (for testing/demo purposes)
 */
export async function analyzeSnippet(
  code: string,
  filename?: string
): Promise<AnalysisResult> {
  return analyzeCode(code, filename);
}
