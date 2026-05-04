"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
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
  Camera,
  Menu,
  X,
  Star,
  Users,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/* ──────────────── Animation Variants ──────────────── */

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

/* ──────────────── Typing Effect Hook ──────────────── */

function useTypingEffect(lines: string[], typeSpeed = 40, pauseSpeed = 1800) {
  const [displayed, setDisplayed] = useState<string[]>([]);
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);

  useEffect(() => {
    if (lineIdx >= lines.length) {
      const timer = setTimeout(() => {
        setDisplayed([]);
        setLineIdx(0);
        setCharIdx(0);
      }, pauseSpeed);
      return () => clearTimeout(timer);
    }

    const currentLine = lines[lineIdx];

    if (charIdx < currentLine.length) {
      const timer = setTimeout(() => {
        setDisplayed((prev) => {
          const copy = [...prev];
          copy[lineIdx] = currentLine.slice(0, charIdx + 1);
          return copy;
        });
        setCharIdx((c) => c + 1);
      }, typeSpeed);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setLineIdx((l) => l + 1);
      setCharIdx(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [lineIdx, charIdx, lines, typeSpeed, pauseSpeed]);

  return { displayed, lineIdx };
}

/* ──────────────── Feature Card Data ──────────────── */

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  bg: string;
}

const features: Feature[] = [
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
    title: "Security Scanning",
    description:
      "Automated OWASP security checks, header analysis, and vulnerability detection for your web applications.",
    color: "text-warm-red",
    bg: "bg-warm-red/10",
  },
  {
    icon: Eye,
    title: "Accessibility Auditing",
    description:
      "WCAG compliance testing with automated checks for contrast, ARIA labels, keyboard navigation, and more.",
    color: "text-electric-violet",
    bg: "bg-electric-violet/10",
  },
  {
    icon: Camera,
    title: "Visual Regression",
    description:
      "Pixel-perfect comparison with baseline screenshots and intelligent diff detection to catch visual bugs.",
    color: "text-emerald",
    bg: "bg-emerald/10",
  },
  {
    icon: Bug,
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
];

/* ──────────────── Pricing Tiers ──────────────── */

interface PricingTier {
  name: string;
  price: string;
  description: string;
  features: string[];
  popular?: boolean;
  cta: string;
}

const pricingTiers: PricingTier[] = [
  {
    name: "Free",
    price: "$0",
    description: "Perfect for getting started and exploring Probato",
    features: [
      "20 credits per month",
      "1 project",
      "Basic test generation",
      "Email support",
    ],
    cta: "Get Started",
  },
  {
    name: "Pro",
    price: "$29",
    description: "For developers who want comprehensive testing",
    features: [
      "100 credits per month",
      "10 projects",
      "All test types",
      "Security & a11y scans",
      "Priority support",
      "API access",
    ],
    popular: true,
    cta: "Get Started",
  },
  {
    name: "Team",
    price: "$79",
    description: "For teams that need collaboration and scale",
    features: [
      "500 credits per month",
      "Unlimited projects",
      "Everything in Pro",
      "Team collaboration",
      "Custom integrations",
      "Dedicated support",
    ],
    cta: "Get Started",
  },
];

/* ──────────────── FAQ Data ──────────────── */

const faqItems = [
  {
    question: "How does Probato discover features?",
    answer:
      "Probato uses AI to analyze your React/Next.js codebase, identifying routes, components, forms, and API endpoints. It maps your application structure and builds a dependency graph to ensure tests run in the optimal order.",
  },
  {
    question: "Do I need to write any test code?",
    answer:
      "No! Probato generates Playwright E2E tests automatically based on discovered features. You can review, edit, and customize the generated tests, but zero manual test writing is required.",
  },
  {
    question: "What types of testing does Probato support?",
    answer:
      "Probato supports functional E2E testing, visual regression testing, security scanning (OWASP), accessibility auditing (WCAG), and scheduled recurring tests. All powered by AI with multi-LLM analysis.",
  },
  {
    question: "How does auto-healing work?",
    answer:
      "When a test fails due to code changes, Probato uses AI to diagnose the issue and suggest or automatically apply fixes to your test selectors and assertions, keeping your test suite green without manual maintenance.",
  },
  {
    question: "Can I integrate Probato with my CI/CD pipeline?",
    answer:
      "Yes! Probato integrates with GitHub via webhooks, supports scheduled test runs with cron expressions, and provides a REST API and SDK for custom integrations. Get notified via Slack, Discord, or email.",
  },
];

/* ──────────────── Code Snippet Lines ──────────────── */

const codeLines = [
  "$ probato scan ./my-app",
  "✓ Discovered 47 features across 12 routes",
  "✓ Generated 94 Playwright E2E tests",
  "✓ All tests passing — ship with confidence!",
];

/* ════════════════════════════════════════════════════
   LANDING PAGE COMPONENT
   ════════════════════════════════════════════════════ */

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { displayed: typedLines, lineIdx } = useTypingEffect(codeLines, 35, 2200);

  const handleGitHubSignIn = () =>
    signIn("github", { callbackUrl: "/onboarding" });

  return (
    <div className="min-h-screen bg-off-white">
      {/* ─── Navigation ─── */}
      <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Probato"
              className="h-8 w-8 rounded-lg"
            />
            <span className="text-xl font-bold text-deep-indigo">Probato</span>
          </div>

          {/* Desktop Links */}
          <div className="hidden items-center gap-8 md:flex">
            {["Features", "How It Works", "Pricing", "FAQ"].map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase().replace(/ /g, "-")}`}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-deep-indigo"
              >
                {label}
              </a>
            ))}
            <a
              href="https://github.com/plural-cmyk/Probato-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-deep-indigo"
            >
              Docs
            </a>
          </div>

          {/* Desktop Auth */}
          <div className="hidden items-center gap-3 md:flex">
            <Button
              variant="ghost"
              className="text-sm text-muted-foreground hover:text-deep-indigo"
              onClick={handleGitHubSignIn}
            >
              Sign In
            </Button>
            <Button
              className="bg-electric-violet text-sm text-white hover:bg-electric-violet/90"
              onClick={handleGitHubSignIn}
            >
              <Github className="mr-2 h-4 w-4" />
              Get Started
            </Button>
          </div>

          {/* Mobile Hamburger */}
          <button
            className="flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted md:hidden"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden border-t bg-white md:hidden"
            >
              <div className="flex flex-col gap-1 px-4 py-4">
                {["Features", "How It Works", "Pricing", "FAQ"].map(
                  (label) => (
                    <a
                      key={label}
                      href={`#${label.toLowerCase().replace(/ /g, "-")}`}
                      className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-deep-indigo"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {label}
                    </a>
                  ),
                )}
                <a
                  href="https://github.com/plural-cmyk/Probato-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-deep-indigo"
                >
                  Docs
                </a>
                <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    className="w-full text-sm"
                    onClick={() => {
                      handleGitHubSignIn();
                      setMobileMenuOpen(false);
                    }}
                  >
                    Sign In
                  </Button>
                  <Button
                    className="w-full bg-electric-violet text-sm text-white hover:bg-electric-violet/90"
                    onClick={() => {
                      handleGitHubSignIn();
                      setMobileMenuOpen(false);
                    }}
                  >
                    <Github className="mr-2 h-4 w-4" />
                    Get Started
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ─── Hero Section ─── */}
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

        {/* Decorative glow */}
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-electric-violet/10 blur-[120px]" />

        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
          <motion.div
            className="text-center"
            initial="initial"
            animate="animate"
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="mb-6">
              <Badge className="border-electric-violet/30 bg-electric-violet/20 px-4 py-1.5 text-sm text-electric-violet hover:bg-electric-violet/30">
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
                className="h-12 bg-electric-violet px-8 text-base text-white hover:bg-electric-violet/90"
                onClick={handleGitHubSignIn}
              >
                <Github className="mr-2 h-5 w-5" />
                Start with GitHub
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 border-white/20 px-8 text-base text-white hover:bg-white/10"
                onClick={() =>
                  document
                    .getElementById("how-it-works")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                See How It Works
              </Button>
            </motion.div>

            {/* Animated Code Snippet */}
            <motion.div
              variants={fadeInUp}
              className="mx-auto mt-14 max-w-xl"
            >
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-left backdrop-blur-sm">
                <div className="mb-3 flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-warm-red/80" />
                  <div className="h-2.5 w-2.5 rounded-full bg-amber/80" />
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald/80" />
                  <span className="ml-2 text-[11px] text-white/30 font-mono">
                    terminal
                  </span>
                </div>
                <div className="space-y-1.5 font-mono text-sm">
                  {codeLines.map((line, i) => (
                    <div key={i} className="flex">
                      <span className="min-h-[1.375rem] text-white/80">
                        {typedLines[i] || ""}
                        {lineIdx === i && lineIdx < codeLines.length && (
                          <span className="ml-px inline-block h-4 w-2 animate-pulse bg-electric-violet/80" />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Trust Badges + Stats */}
            <motion.div
              variants={fadeInUp}
              className="mt-14 flex flex-col items-center gap-6"
            >
              {/* Trust badges */}
              <div className="flex flex-wrap items-center justify-center gap-4">
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/60">
                  <Users className="h-4 w-4 text-electric-violet" />
                  Trusted by 500+ developers
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/60">
                  <Star className="h-4 w-4 text-amber" />
                  4.9/5 avg rating
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/60">
                  <Clock className="h-4 w-4 text-emerald" />
                  &lt;2 min setup
                </div>
              </div>

              {/* Bigger stats */}
              <div className="grid w-full max-w-lg grid-cols-3 gap-8">
                {[
                  { value: "10x", label: "Faster Testing" },
                  { value: "95%", label: "Coverage" },
                  { value: "0", label: "Tests Written" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className="text-4xl font-bold text-white lg:text-5xl">
                      {stat.value}
                    </div>
                    <div className="mt-1 text-sm text-white/50">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Wave divider */}
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

      {/* ─── Logos / Social Proof Bar ─── */}
      <section className="border-b bg-off-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="mb-8 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Trusted by teams at
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 lg:gap-16">
              {[
                "Acme Corp",
                "TechFlow",
                "DevHub",
                "CloudScale",
                "ShipFast",
              ].map((name) => (
                <div
                  key={name}
                  className="flex h-10 items-center justify-center rounded-md border border-border/50 bg-white px-5 py-2 text-sm font-semibold tracking-tight text-muted-foreground/70 shadow-sm transition-colors hover:text-deep-indigo sm:h-12 sm:px-6 sm:text-base"
                >
                  {name}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Demo Preview Section ─── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Card className="overflow-hidden border-2 shadow-2xl">
            <CardHeader className="border-b bg-deep-indigo/5 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-warm-red" />
                  <div className="h-3 w-3 rounded-full bg-amber" />
                  <div className="h-3 w-3 rounded-full bg-emerald" />
                </div>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
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
                          ? "border-emerald/20 bg-emerald/10 text-emerald"
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

      {/* ─── Features Section (9 Cards) ─── */}
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
                className="bg-electric-violet/10 text-electric-violet"
              >
                Core Features
              </Badge>
            </motion.div>
            <motion.h2
              variants={fadeInUp}
              className="mt-4 text-3xl font-bold tracking-tight text-deep-indigo sm:text-4xl"
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
            {features.map((feature) => (
              <motion.div key={feature.title} variants={fadeInUp}>
                <Card className="h-full border-border/50 transition-shadow hover:shadow-lg">
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

      {/* ─── How It Works Section ─── */}
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
                className="bg-deep-indigo/10 text-deep-indigo"
              >
                How It Works
              </Badge>
            </motion.div>
            <motion.h2
              variants={fadeInUp}
              className="mt-4 text-3xl font-bold tracking-tight text-deep-indigo sm:text-4xl"
            >
              Three steps to comprehensive test coverage
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground"
            >
              Get from zero to full E2E test coverage in minutes, not weeks.
            </motion.p>
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
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-deep-indigo font-mono text-lg font-bold text-white">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold text-deep-indigo">
                    {item.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── Pricing Section ─── */}
      <section id="pricing" className="bg-white py-24">
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
                className="bg-electric-violet/10 text-electric-violet"
              >
                Pricing
              </Badge>
            </motion.div>
            <motion.h2
              variants={fadeInUp}
              className="mt-4 text-3xl font-bold tracking-tight text-deep-indigo sm:text-4xl"
            >
              Simple, transparent pricing
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground"
            >
              Start for free, upgrade when you need more power. No hidden fees,
              no surprises.
            </motion.p>
          </motion.div>

          <motion.div
            className="mx-auto mt-16 grid max-w-5xl gap-8 lg:grid-cols-3"
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {pricingTiers.map((tier) => (
              <motion.div key={tier.name} variants={fadeInUp}>
                <Card
                  className={`relative h-full flex flex-col ${
                    tier.popular
                      ? "border-2 border-electric-violet shadow-xl shadow-electric-violet/10"
                      : "border-border/50"
                  }`}
                >
                  {tier.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-electric-violet px-3 py-1 text-xs text-white hover:bg-electric-violet/90">
                        Most Popular
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg text-deep-indigo">
                      {tier.name}
                    </CardTitle>
                    <CardDescription>{tier.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="mb-6">
                      <span className="text-4xl font-bold text-deep-indigo">
                        {tier.price}
                      </span>
                      <span className="text-muted-foreground">/mo</span>
                    </div>
                    <ul className="space-y-3">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter className="pt-2">
                    <Button
                      className={`w-full ${
                        tier.popular
                          ? "bg-electric-violet text-white hover:bg-electric-violet/90"
                          : "bg-deep-indigo text-white hover:bg-deep-indigo/90"
                      }`}
                      onClick={handleGitHubSignIn}
                    >
                      <Github className="mr-2 h-4 w-4" />
                      {tier.cta}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section id="faq" className="bg-off-white py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
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
                className="bg-deep-indigo/10 text-deep-indigo"
              >
                FAQ
              </Badge>
            </motion.div>
            <motion.h2
              variants={fadeInUp}
              className="mt-4 text-3xl font-bold tracking-tight text-deep-indigo sm:text-4xl"
            >
              Frequently asked questions
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground"
            >
              Everything you need to know about Probato. Can&apos;t find the
              answer you&apos;re looking for? Reach out to our support team.
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-12"
          >
            <Accordion type="single" collapsible className="w-full">
              {faqItems.map((item, idx) => (
                <AccordionItem key={idx} value={`item-${idx}`}>
                  <AccordionTrigger className="text-left text-base font-medium text-deep-indigo hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
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
              <span className="text-electric-violet">
                Start shipping them.
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
              Join developers who use Probato to automate their testing pipeline.
              Connect your repo and get started in minutes.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="h-12 bg-electric-violet px-8 text-base text-white hover:bg-electric-violet/90"
                onClick={handleGitHubSignIn}
              >
                <Github className="mr-2 h-5 w-5" />
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
            <p className="mt-4 text-sm text-white/40">
              No credit card required. Free plan includes 20 credits per month.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-5">
            {/* Brand */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2">
                <img
                  src="/logo.png"
                  alt="Probato"
                  className="h-7 w-7 rounded-md"
                />
                <span className="text-sm font-semibold text-deep-indigo">
                  Probato
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                AI-powered E2E testing that writes itself. Ship with confidence.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold text-deep-indigo">
                Product
              </h4>
              <ul className="mt-3 space-y-2">
                {[
                  { label: "Features", href: "#features" },
                  { label: "Pricing", href: "#pricing" },
                  { label: "Docs", href: "https://github.com/plural-cmyk/Probato-ai" },
                  { label: "API", href: "#" },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-deep-indigo"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-sm font-semibold text-deep-indigo">
                Company
              </h4>
              <ul className="mt-3 space-y-2">
                {[
                  { label: "About", href: "#" },
                  { label: "Blog", href: "#" },
                  { label: "Careers", href: "#" },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-deep-indigo"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sm font-semibold text-deep-indigo">Legal</h4>
              <ul className="mt-3 space-y-2">
                {[
                  { label: "Privacy", href: "#" },
                  { label: "Terms", href: "#" },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-deep-indigo"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Community */}
            <div>
              <h4 className="text-sm font-semibold text-deep-indigo">
                Community
              </h4>
              <ul className="mt-3 space-y-2">
                {[
                  {
                    label: "GitHub",
                    href: "https://github.com/plural-cmyk/Probato-ai",
                  },
                  { label: "Discord", href: "#" },
                  { label: "Status", href: "#" },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.href.startsWith("http") ? "_blank" : undefined}
                      rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="text-sm text-muted-foreground transition-colors hover:text-deep-indigo"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-8 md:flex-row">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Probato. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/plural-cmyk/Probato-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-deep-indigo"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
