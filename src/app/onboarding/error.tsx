"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Onboarding Error Boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-off-white p-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-warm-red/10">
          <AlertTriangle className="h-8 w-8 text-warm-red" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-deep-indigo">
            Something went wrong
          </h2>
          <p className="mt-2 text-muted-foreground">
            An error occurred during onboarding. Please try again or skip to the
            dashboard.
          </p>
          {error.message && (
            <p className="mt-3 rounded-lg bg-muted p-3 text-xs font-mono text-muted-foreground break-all">
              {error.message}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => reset()}
            className="bg-electric-violet text-white hover:bg-electric-violet/90 gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/dashboard")}
          >
            Skip to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
