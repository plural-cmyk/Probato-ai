"use client";

import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import {
  Bug,
  Zap,
  GitBranch,
  Eye,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Play,
  Code2,
  Shield,
  Cpu,
  Github,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-off-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Probato" className="h-8 w-8 rounded-lg" />
            <span className="text-xl font-bold text-deep-indigo">Probato</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm font-medium text-muted-foreground hover:text-deep-indigo transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-muted-foreground hover:text-deep-indigo transition-colors"
            >
              How It Works
            </a>
            <a
              href="#pricing"
              className="text-sm font-medium text-muted-foreground hover:text-deep-indigo transition-colors"
            >
              Pricing
            </a>
            <a
              href="#docs"
              className="text-sm font-medium text-muted-foreground hover:text-deep-indigo transition-colors"
            >
              Docs
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="text-sm text-muted-foreground hover:text-deep-indigo"
              onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
            >
              Sign In
            </Button>
            <Button
              className="bg-electric-violet hover:bg-electric-violet/90 text-white text-sm"
              onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
            >
              <Github className="mr-2 h-4 w-4" />
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-deep-indigo">
        <div className="absolute inset-0 bg-gradient-to-br from-deep-indigo via-deep-indigo/95 to-electric-violet/20" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
          <motion.div
            className="text-center"
            initial="initial"
            animate="animate"
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="mb-6">
              <Badge className="bg-electric-violet/20 text-electric-violet border-electric-violet/30 hover:bg-electric-violet/30 px-4 py-1.5 text-sm">
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                AI-Powered Testing
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeInUp}
              className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-7xl"
            >
              Clone. Discover.
              <br />
              <span className="text-electric-violet">Test. Fix. Ship.</span>
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-6 max-w-2xl text-lg text-white/70 sm:text-xl"
            >
              Probato automatically discovers features in your codebase and
              generates, runs, and maintains end-to-end tests using AI. No more
              writing tests manually.
            </motion.p>

            <motion.div
              variants={fadeInUp}
              className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
            >
              <Button
                size="lg"
                className="bg-electric-violet hover:bg-electric-violet/90 text-white h-12 px-8 text-base"
                onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
              >
                <Github className="mr-2 h-5 w-5" />
                Start with GitHub
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-white/20 text-white hover:bg-white/10 h-12 px-8 text-base"
                onClick={() =>
                  document
                    .getElementById("how-it-works")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                See How It Works
              </Button>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              className="mt-16 grid grid-cols-3 gap-8 mx-auto max-w-lg"
            >
              {[
                { value: "10x", label: "Faster Testing" },
                { value: "95%", label: "Coverage" },
                { value: "0", label: "Tests Written" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-3xl font-bold text-white">
                    {stat.value}
                  </div>
                  <div className="text-sm text-white/50">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <svg
            viewBox="0 0 1440 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full"
          >
            <path
              d="M0 60V20C240 0 480 40 720 30C960 20 1200 0 1440 20V60H0Z"
              fill="#F8FAFC"
            />
          </svg>
        </div>
      </section>

      {/* Demo Preview Section */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 -mt-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Card className="overflow-hidden border-2 shadow-2xl">
            <CardHeader className="bg-deep-indigo/5 border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-warm-red" />
                  <div className="h-3 w-3 rounded-full bg-amber" />
                  <div className="h-3 w-3 rounded-full bg-emerald" />
                </div>
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  probato-dashboard — 3 test suites
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  {
                    name: "Landing Page",
                    status: "passed",
                    icon: CheckCircle2,
                    duration: "2.4s",
                  },
                  {
                    name: "Dashboard",
                    status: "passed",
                    icon: CheckCircle2,
                    duration: "3.1s",
                  },
                  {
                    name: "Sign In Flow",
                    status: "failed",
                    icon: AlertTriangle,
                    duration: "8.9s",
                  },
                ].map((test) => (
                  <div
                    key={test.name}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <test.icon
                        className={`h-5 w-5 ${
                          test.status === "passed"
                            ? "text-emerald"
                            : "text-warm-red"
                        }`}
                      />
                      <div>
                        <div className="text-sm font-medium">{test.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {test.duration}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant={
                        test.status === "passed" ? "default" : "destructive"
                      }
                      className={
                        test.status === "passed"
                          ? "bg-emerald/10 text-emerald border-emerald/20"
                          : ""
                      }
                    >
                      {test.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center"
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp}>
              <Badge
                variant="secondary"
                className="mb-4 bg-electric-violet/10 text-electric-violet"
              >
                Core Features
              </Badge>
            </motion.div>
            <motion.h2
              variants={fadeInUp}
              className="text-3xl font-bold tracking-tight text-deep-indigo sm:text-4xl"
            >
              Everything you need to ship with confidence
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground"
            >
              From code analysis to test generation to automated fixing — Probato
              handles the entire testing lifecycle.
            </motion.p>
          </motion.div>

          <motion.div
            className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3"
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {[
              {
                icon: Eye,
                title: "Feature Discovery",
                description:
                  "AI parses your React/Next.js codebase, discovers routes, components, forms, and API endpoints automatically.",
                color: "text-electric-violet",
                bg: "bg-electric-violet/10",
              },
              {
                icon: Play,
                title: "Test Generation",
                description:
                  "Generates Playwright E2E tests based on discovered features with smart selectors and realistic user scenarios.",
                color: "text-emerald",
                bg: "bg-emerald/10",
              },
              {
                icon: Code2,
                title: "Docker Sandbox",
                description:
                  "Runs tests in isolated Docker containers with resource limits, network isolation, and full browser automation.",
                color: "text-amber",
                bg: "bg-amber/10",
              },
              {
                icon: Shield,
                title: "Multi-LLM Analysis",
                description:
                  "Claude for code analysis, GPT-4 Vision for screenshots. Smart fallback ensures your tests always get analyzed.",
                color: "text-electric-violet",
                bg: "bg-electric-violet/10",
              },
              {
                icon: GitBranch,
                title: "Dependency Graph",
                description:
                  "Builds a topological sort of your features so tests run in the right order — pages before APIs, auth before actions.",
                color: "text-emerald",
                bg: "bg-emerald/10",
              },
              {
                icon: Cpu,
                title: "Auto-Healing",
                description:
                  "When tests break, Probato diagnoses the issue and suggests or applies fixes — keeping your test suite green.",
                color: "text-amber",
                bg: "bg-amber/10",
              },
            ].map((feature) => (
              <motion.div key={feature.title} variants={fadeInUp}>
                <Card className="h-full transition-shadow hover:shadow-lg border-border/50">
                  <CardHeader>
                    <div
                      className={`mb-2 flex h-10 w-10 items-center justify-center rounded-lg ${feature.bg}`}
                    >
                      <feature.icon className={`h-5 w-5 ${feature.color}`} />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="bg-off-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center"
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp}>
              <Badge
                variant="secondary"
                className="mb-4 bg-deep-indigo/10 text-deep-indigo"
              >
                How It Works
              </Badge>
            </motion.div>
            <motion.h2
              variants={fadeInUp}
              className="text-3xl font-bold tracking-tight text-deep-indigo sm:text-4xl"
            >
              Three steps to comprehensive test coverage
            </motion.h2>
          </motion.div>

          <motion.div
            className="mt-16 grid gap-8 md:grid-cols-3"
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {[
              {
                step: "01",
                title: "Connect Your Repo",
                description:
                  "Link your GitHub repository. Probato clones your codebase and starts analyzing the structure immediately.",
                icon: GitBranch,
              },
              {
                step: "02",
                title: "Discover & Generate",
                description:
                  "AI discovers all features — routes, components, forms, APIs — and generates comprehensive Playwright tests.",
                icon: Eye,
              },
              {
                step: "03",
                title: "Run & Maintain",
                description:
                  "Tests run in isolated sandboxes. When code changes, Probato auto-updates tests to keep your suite green.",
                icon: Play,
              },
            ].map((item) => (
              <motion.div key={item.step} variants={fadeInUp}>
                <div className="relative">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-deep-indigo text-white font-mono text-lg font-bold">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold text-deep-indigo">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-deep-indigo py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Stop writing tests.
              <br />
              <span className="text-electric-violet">Start shipping them.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
              Join developers who use Probato to automate their testing pipeline.
              Connect your repo and get started in minutes.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="bg-electric-violet hover:bg-electric-violet/90 text-white h-12 px-8 text-base"
                onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
              >
                <Github className="mr-2 h-5 w-5" />
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Probato" className="h-7 w-7 rounded-md" />
              <span className="text-sm font-semibold text-deep-indigo">
                Probato
              </span>
            </div>
            <div className="flex gap-6">
              <a
                href="#"
                className="text-sm text-muted-foreground hover:text-deep-indigo transition-colors"
              >
                Documentation
              </a>
              <a
                href="https://github.com/plural-cmyk/Probato-ai"
                className="text-sm text-muted-foreground hover:text-deep-indigo transition-colors"
              >
                GitHub
              </a>
              <a
                href="#"
                className="text-sm text-muted-foreground hover:text-deep-indigo transition-colors"
              >
                Discord
              </a>
              <a
                href="#"
                className="text-sm text-muted-foreground hover:text-deep-indigo transition-colors"
              >
                Status
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Probato. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
