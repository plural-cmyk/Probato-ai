"use client";

import { signIn, getProviders } from "next-auth/react";
import { useEffect, useState } from "react";
import { Github, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignInPage() {
  const [providers, setProviders] = useState<Record<string, { id: string; name: string }>>({});

  useEffect(() => {
    getProviders().then((p) => {
      if (p) setProviders(p as Record<string, { id: string; name: string }>);
    });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-off-white">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,.02)_1px,transparent_1px)] bg-[size:60px_60px]" />

      <div className="relative w-full max-w-md px-4">
        {/* Logo */}
        <div className="mb-8 text-center">
          <img
            src="/logo.png"
            alt="Probato"
            className="mx-auto mb-4 h-16 w-16 rounded-xl"
          />
          <h1 className="text-2xl font-bold text-deep-indigo">Probato</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-Powered Autonomous Testing
          </p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Sign in to your account</CardTitle>
            <CardDescription>
              Connect with GitHub to get started
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.values(providers).map((provider) => (
              <Button
                key={provider.id}
                onClick={() => signIn(provider.id, { callbackUrl: "/dashboard" })}
                className="w-full h-12 text-base bg-deep-indigo hover:bg-deep-indigo/90 text-white"
                size="lg"
              >
                <Github className="mr-2 h-5 w-5" />
                Continue with {provider.name}
              </Button>
            ))}

            {/* Fallback if providers haven't loaded yet */}
            {Object.keys(providers).length === 0 && (
              <Button
                onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
                className="w-full h-12 text-base bg-deep-indigo hover:bg-deep-indigo/90 text-white"
                size="lg"
              >
                <Github className="mr-2 h-5 w-5" />
                Continue with GitHub
              </Button>
            )}

            <div className="pt-2 text-center">
              <a
                href="/"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-deep-indigo transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to home
              </a>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
