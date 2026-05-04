"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  X,
  Rocket,
  GitBranch,
  Search,
  Play,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  actionLabel: string;
  actionUrl: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "connect_repo",
    title: "Connect a Repository",
    description: "Link your GitHub repo to start testing your application",
    icon: GitBranch,
    actionLabel: "Connect Repo",
    actionUrl: "/onboarding",
  },
  {
    id: "discover",
    title: "Discover Features",
    description: "Let Probato analyze your app and find testable features",
    icon: Search,
    actionLabel: "Discover",
    actionUrl: "/onboarding",
  },
  {
    id: "first_test",
    title: "Run Your First Test",
    description: "See Probato in action with an automated test run",
    icon: Play,
    actionLabel: "Run Test",
    actionUrl: "/onboarding",
  },
];

interface OnboardingChecklistProps {
  /** Called when the user dismisses the checklist */
  onDismiss?: () => void;
}

export default function OnboardingChecklist({ onDismiss }: OnboardingChecklistProps) {
  const router = useRouter();
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    async function loadOnboarding() {
      try {
        const res = await fetch("/api/onboarding");
        if (res.ok) {
          const data = await res.json();
          const steps = data.onboarding?.completedSteps ?? [];
          setCompletedSteps(steps);
          // If onboarding is already complete or skipped, don't show
          if (
            data.onboarding?.completedAt ||
            data.onboarding?.skipped ||
            data.onboarding?.dismissedAt
          ) {
            setVisible(false);
          }
        }
      } catch {
        // Silently fail — checklist is optional
      } finally {
        setLoading(false);
      }
    }
    loadOnboarding();
  }, []);

  async function handleDismiss() {
    setVisible(false);
    try {
      await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipped: true }),
      });
    } catch {
      // Silently fail
    }
    onDismiss?.();
  }

  if (loading || !visible) return null;

  const completedCount = ONBOARDING_STEPS.filter((s) =>
    completedSteps.includes(s.id)
  ).length;
  const progressPercent = (completedCount / ONBOARDING_STEPS.length) * 100;
  const allComplete = completedCount === ONBOARDING_STEPS.length;

  return (
    <Card className="border-electric-violet/20 bg-gradient-to-br from-deep-indigo/5 to-electric-violet/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-electric-violet/10">
              <Rocket className="h-4 w-4 text-electric-violet" />
            </div>
            <CardTitle className="text-base">
              {allComplete ? "You're all set!" : "Get started with Probato"}
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {!allComplete && (
          <div className="mt-2 space-y-1">
            <Progress
              value={progressPercent}
              className="h-2 [&>div]:bg-electric-violet"
            />
            <p className="text-xs text-muted-foreground">
              {completedCount} of {ONBOARDING_STEPS.length} steps completed
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {allComplete ? (
          <div className="flex items-center gap-3 rounded-lg bg-emerald/10 p-3">
            <Sparkles className="h-5 w-5 text-emerald shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald">
                Onboarding complete!
              </p>
              <p className="text-xs text-muted-foreground">
                Your testing pipeline is ready. Explore the dashboard to manage your projects.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {ONBOARDING_STEPS.map((step) => {
              const isCompleted = completedSteps.includes(step.id);
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    isCompleted
                      ? "border-emerald/20 bg-emerald/5"
                      : "border-border hover:border-electric-violet/30 hover:bg-electric-violet/5"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        isCompleted
                          ? "text-emerald line-through"
                          : "text-foreground"
                      }`}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {step.description}
                    </p>
                  </div>
                  {!isCompleted && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-electric-violet hover:text-electric-violet hover:bg-electric-violet/10"
                      onClick={() => router.push(step.actionUrl)}
                    >
                      {step.actionLabel}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
