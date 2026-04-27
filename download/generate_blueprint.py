#!/usr/bin/env python3
"""
Probato Technical Blueprint PDF Generator
Generates a comprehensive technical blueprint document using ReportLab.
"""

import os
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable, ListFlowable, ListItem,
    NextPageTemplate, PageTemplate, Frame
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ── Font Registration ──────────────────────────────────────────────
pdfmetrics.registerFont(TTFont('TimesNewRoman', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('TimesNewRoman-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('TimesNewRoman-Italic', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('TimesNewRoman-BoldItalic', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'))
registerFontFamily('TimesNewRoman', normal='TimesNewRoman', bold='TimesNewRoman-Bold',
                    italic='TimesNewRoman-Italic', boldItalic='TimesNewRoman-BoldItalic')

pdfmetrics.registerFont(TTFont('Calibri', '/usr/share/fonts/truetype/english/Carlito-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Calibri-Bold', '/usr/share/fonts/truetype/english/Carlito-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Calibri-Italic', '/usr/share/fonts/truetype/english/Carlito-Italic.ttf'))
pdfmetrics.registerFont(TTFont('Calibri-BoldItalic', '/usr/share/fonts/truetype/english/Carlito-BoldItalic.ttf'))
registerFontFamily('Calibri', normal='Calibri', bold='Calibri-Bold',
                    italic='Calibri-Italic', boldItalic='Calibri-BoldItalic')

pdfmetrics.registerFont(TTFont('DejaVuSansMono', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSansMono-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSansMono-Oblique', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Oblique.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSansMono-BoldOblique', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-BoldOblique.ttf'))
registerFontFamily('DejaVuSansMono', normal='DejaVuSansMono', bold='DejaVuSansMono-Bold',
                    italic='DejaVuSansMono-Oblique', boldItalic='DejaVuSansMono-BoldOblique')

pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')

# ── Color Palette ──────────────────────────────────────────────────
PAGE_BG       = colors.HexColor('#f5f6f6')
SECTION_BG    = colors.HexColor('#eceeee')
CARD_BG       = colors.HexColor('#e4e6e8')
TABLE_STRIPE  = colors.HexColor('#eff0f1')
HEADER_FILL   = colors.HexColor('#37464e')
COVER_BLOCK   = colors.HexColor('#4d6673')
BORDER        = colors.HexColor('#c0cbd0')
ICON          = colors.HexColor('#4e7d94')
ACCENT        = colors.HexColor('#ce3750')
ACCENT_2      = colors.HexColor('#9a52cd')
TEXT_PRIMARY   = colors.HexColor('#1a1b1c')
TEXT_MUTED     = colors.HexColor('#737a7d')
SEM_SUCCESS   = colors.HexColor('#408c5a')
SEM_WARNING   = colors.HexColor('#9d7e3f')
SEM_ERROR     = colors.HexColor('#9a423a')
SEM_INFO      = colors.HexColor('#526f8c')

# Probato brand colors
BRAND_INDIGO  = colors.HexColor('#1E1B4B')
BRAND_VIOLET  = colors.HexColor('#7C3AED')
BRAND_EMERALD = colors.HexColor('#10B981')
BRAND_RED     = colors.HexColor('#EF4444')
BRAND_AMBER   = colors.HexColor('#F59E0B')
BRAND_OFFWHITE= colors.HexColor('#F8FAFC')

# ── Page Setup ─────────────────────────────────────────────────────
PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT_MARGIN = inch
RIGHT_MARGIN = inch
TOP_MARGIN = inch
BOTTOM_MARGIN = inch
CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN

# ── Styles ─────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

# Title style for document title
style_title = ParagraphStyle(
    'DocTitle', parent=styles['Title'],
    fontName='TimesNewRoman-Bold', fontSize=28, leading=34,
    textColor=TEXT_PRIMARY, spaceAfter=12, alignment=TA_LEFT
)

# H1 style
style_h1 = ParagraphStyle(
    'H1Custom', parent=styles['Heading1'],
    fontName='TimesNewRoman-Bold', fontSize=22, leading=28,
    textColor=TEXT_PRIMARY, spaceBefore=24, spaceAfter=12, alignment=TA_LEFT
)

# H2 style
style_h2 = ParagraphStyle(
    'H2Custom', parent=styles['Heading2'],
    fontName='TimesNewRoman-Bold', fontSize=16, leading=20,
    textColor=ACCENT, spaceBefore=18, spaceAfter=8, alignment=TA_LEFT
)

# H3 style
style_h3 = ParagraphStyle(
    'H3Custom', parent=styles['Heading3'],
    fontName='Calibri-Bold', fontSize=13, leading=17,
    textColor=SEM_INFO, spaceBefore=12, spaceAfter=6, alignment=TA_LEFT
)

# Body text
style_body = ParagraphStyle(
    'BodyCustom', parent=styles['BodyText'],
    fontName='Calibri', fontSize=10, leading=15,
    textColor=TEXT_PRIMARY, spaceAfter=8, alignment=TA_JUSTIFY
)

# Bullet style
style_bullet = ParagraphStyle(
    'BulletCustom', parent=style_body,
    fontName='Calibri', fontSize=10, leading=14,
    leftIndent=20, bulletIndent=8, spaceAfter=4
)

# Sub-bullet style
style_subbullet = ParagraphStyle(
    'SubBulletCustom', parent=style_body,
    fontName='Calibri', fontSize=9.5, leading=13,
    leftIndent=36, bulletIndent=24, spaceAfter=3
)

# Table header style
style_table_header = ParagraphStyle(
    'TableHeader', parent=style_body,
    fontName='Calibri-Bold', fontSize=9, leading=12,
    textColor=colors.white, alignment=TA_CENTER
)

# Table cell style
style_table_cell = ParagraphStyle(
    'TableCell', parent=style_body,
    fontName='Calibri', fontSize=8.5, leading=12,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT
)

# Table cell centered
style_table_cell_center = ParagraphStyle(
    'TableCellCenter', parent=style_table_cell,
    alignment=TA_CENTER
)

# Code style
style_code = ParagraphStyle(
    'CodeCustom', parent=style_body,
    fontName='DejaVuSansMono', fontSize=8.5, leading=12,
    textColor=TEXT_PRIMARY, backColor=CARD_BG,
    leftIndent=12, rightIndent=12, spaceBefore=4, spaceAfter=4,
    borderPadding=6
)

# Caption / muted text
style_muted = ParagraphStyle(
    'MutedCustom', parent=style_body,
    fontName='Calibri-Italic', fontSize=9, leading=12,
    textColor=TEXT_MUTED, spaceAfter=6
)

# TOC entry styles
style_toc_h1 = ParagraphStyle(
    'TOCH1', parent=style_body,
    fontName='Calibri-Bold', fontSize=12, leading=18,
    textColor=TEXT_PRIMARY, leftIndent=0, spaceAfter=4
)

style_toc_h2 = ParagraphStyle(
    'TOCH2', parent=style_body,
    fontName='Calibri', fontSize=10, leading=15,
    textColor=TEXT_MUTED, leftIndent=20, spaceAfter=2
)


# ── Helper Functions ───────────────────────────────────────────────

def make_table(headers, rows, col_widths=None):
    """Create a styled table with header and alternating row colors."""
    # Build header row
    header_cells = [Paragraph(h, style_table_header) for h in headers]
    # Build data rows
    data = [header_cells]
    for row in rows:
        data.append([Paragraph(str(cell), style_table_cell) for cell in row])

    if col_widths is None:
        col_widths = [CONTENT_WIDTH / len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, hAlign='CENTER', repeatRows=1)

    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Calibri-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]
    # Alternating row colors
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), TABLE_STRIPE))
        else:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.white))

    t.setStyle(TableStyle(style_cmds))
    return t


def h1(text):
    return Paragraph(text, style_h1)

def h2(text):
    return Paragraph(text, style_h2)

def h3(text):
    return Paragraph(text, style_h3)

def body(text):
    return Paragraph(text, style_body)

def bullet(text):
    return Paragraph(text, style_bullet, bulletText='\u2022')

def subbullet(text):
    return Paragraph(text, style_subbullet, bulletText='\u2013')

def code_block(text):
    return Paragraph(text, style_code)

def muted(text):
    return Paragraph(text, style_muted)

def spacer(h=12):
    return Spacer(1, h)

def section_divider():
    return HRFlowable(width="100%", thickness=1, color=BORDER, spaceBefore=6, spaceAfter=6)


# ── Page Background ────────────────────────────────────────────────
def draw_page_background(canvas, doc):
    """Draw page background and footer on each page."""
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=True, stroke=False)
    # Footer line
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(LEFT_MARGIN, BOTTOM_MARGIN - 10, PAGE_WIDTH - RIGHT_MARGIN, BOTTOM_MARGIN - 10)
    # Page number
    canvas.setFont('Calibri', 8)
    canvas.setFillColor(TEXT_MUTED)
    page_num = canvas.getPageNumber()
    canvas.drawCentredString(PAGE_WIDTH / 2, BOTTOM_MARGIN - 24, f"Page {page_num}")
    # Footer text
    canvas.drawString(LEFT_MARGIN, BOTTOM_MARGIN - 24, "Probato Technical Blueprint")
    canvas.drawRightString(PAGE_WIDTH - RIGHT_MARGIN, BOTTOM_MARGIN - 24, "April 2026")
    canvas.restoreState()


# ── Build Document Content ─────────────────────────────────────────

def build_content():
    story = []

    # ─────────────────────────────────────────────────────────────
    # TABLE OF CONTENTS
    # ─────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(h1("Table of Contents"))
    story.append(spacer(8))

    toc_entries = [
        ("1", "Executive Summary", 1),
        ("2", "System Architecture", 1),
        ("2.1", "High-Level Architecture", 2),
        ("2.2", "Technology Stack", 2),
        ("2.3", "Data Flow", 2),
        ("3", "Agent System Design", 1),
        ("3.1", "Feature Discovery Agent", 2),
        ("3.2", "Test Executor Agent", 2),
        ("3.3", "Code Analysis Agent", 2),
        ("3.4", "Fix Engine Agent", 2),
        ("3.5", "Security Agent", 2),
        ("3.6", "Media Verification Agent", 2),
        ("3.7", "Orchestrator", 2),
        ("4", "Test Site Architecture", 1),
        ("4.1", "Sandboxed Browser Environment", 2),
        ("4.2", "DevTools Integration", 2),
        ("4.3", "Viewing Modes", 2),
        ("4.4", "User Intervention", 2),
        ("5", "Customer Access Flow", 1),
        ("5.1", "Landing Page", 2),
        ("5.2", "Signup and Authentication", 2),
        ("5.3", "Onboarding", 2),
        ("5.4", "Dashboard", 2),
        ("5.5", "Test Run Page", 2),
        ("5.6", "Reports", 2),
        ("6", "Multi-Device Testing Architecture", 1),
        ("6.1", "Orchestrator Design", 2),
        ("6.2", "Messaging Testing", 2),
        ("6.3", "Call Testing", 2),
        ("6.4", "Notification Testing", 2),
        ("6.5", "Payment Testing", 2),
        ("7", "Admin Panel", 1),
        ("7.1", "User Management", 2),
        ("7.2", "Infrastructure Monitoring", 2),
        ("7.3", "Billing and Subscriptions", 2),
        ("7.4", "Agent Performance Metrics", 2),
        ("8", "Design System", 1),
        ("8.1", "Color Palette", 2),
        ("8.2", "Typography", 2),
        ("8.3", "Layout Principles", 2),
        ("9", "Implementation Roadmap", 1),
        ("9.1", "Phase 0: Foundation (Weeks 1-4)", 2),
        ("9.2", "Phase 1: Core Testing Agent (Weeks 5-10)", 2),
        ("9.3", "Phase 2: Code Fix Loop (Weeks 11-16)", 2),
        ("9.4", "Phase 3: Landing Page + Dashboard (Weeks 17-22)", 2),
        ("9.5", "Phase 4: Media + Security Testing (Weeks 23-28)", 2),
        ("9.6", "Phase 5: Multi-Device + Advanced Testing (Weeks 29-36)", 2),
        ("9.7", "Phase 6: Integration + Polish (Weeks 37-44)", 2),
        ("9.8", "Phase 7: Launch + Scale (Weeks 45-52)", 2),
        ("10", "Quality Assurance Parameters", 1),
        ("11", "Risk Assessment", 1),
        ("11.1", "Technical Risks", 2),
        ("11.2", "Business Risks", 2),
        ("11.3", "Mitigation Strategies", 2),
        ("12", "Infrastructure Cost Projections", 1),
    ]

    for num, title, level in toc_entries:
        if level == 1:
            story.append(Paragraph(f"<b>{num}. &nbsp; {title}</b>", style_toc_h1))
        else:
            story.append(Paragraph(f"{num} &nbsp; {title}", style_toc_h2))

    # ─────────────────────────────────────────────────────────────
    # 1. EXECUTIVE SUMMARY
    # ─────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(h1("1. Executive Summary"))
    story.append(spacer(6))
    story.append(body(
        "Probato is an autonomous AI-powered QA testing platform designed to fundamentally transform how software "
        "quality assurance is performed. Traditional QA processes are labor-intensive, error-prone, and difficult to "
        "scale. Teams spend countless hours writing test scripts, maintaining brittle automation frameworks, and "
        "manually debugging failures that arise from complex interactions between frontend code, backend APIs, and "
        "infrastructure configuration. Probato eliminates these pain points by deploying intelligent AI agents that "
        "clone a user's repository, discover features automatically, launch a sandboxed test site with full DevTools "
        "access, and test each feature the way a human tester would, clicking buttons, filling forms, navigating "
        "flows, and verifying outcomes."
    ))
    story.append(body(
        "When the agent encounters a failure, it does not simply report a stack trace. Instead, it examines the "
        "underlying source code, console error logs, and network request details to diagnose the root cause. It then "
        "recommends or applies a fix, with the user's explicit permission, and retests to verify the fix resolves "
        "the issue. This iterative fix-verify loop continues until the feature passes, at which point the agent "
        "proceeds to integration testing and, if all tests pass, pushes the validated code to production. The "
        "platform supports multi-device testing for applications that require cross-device interactions such as "
        "messaging, voice calls, notifications, and payment flows."
    ))
    story.append(body(
        "This technical blueprint serves as the comprehensive reference document for Probato's architecture, agent "
        "system design, implementation roadmap, and quality assurance parameters. It provides engineering teams with "
        "the detailed specifications needed to build, deploy, and scale the platform across all eight implementation "
        "phases spanning 52 weeks. The document covers every major subsystem from the Feature Discovery Agent that "
        "parses codebases to the Security Agent that tests for XSS and authentication bypasses, from the "
        "orchestrator that coordinates multi-device test runs to the admin panel that monitors infrastructure and "
        "billing. By the end of Phase 7, Probato will be a production-ready, publicly launched platform capable of "
        "serving thousands of concurrent users with sub-30-minute test run times and per-run LLM costs under "
        "$0.50."
    ))

    # ─────────────────────────────────────────────────────────────
    # 2. SYSTEM ARCHITECTURE
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("2. System Architecture"))
    story.append(spacer(6))

    # 2.1 High-Level Architecture
    story.append(h2("2.1 High-Level Architecture"))
    story.append(body(
        "Probato's architecture is organized into four distinct layers, each responsible for a clearly defined "
        "set of concerns. The User Layer comprises the Next.js frontend application that serves the landing page, "
        "dashboard, test run pages, and admin panel. This layer handles all user-facing interactions, including "
        "GitHub OAuth authentication, project creation, test run monitoring, and report viewing. It communicates "
        "exclusively with the API/Backend Layer through RESTful endpoints."
    ))
    story.append(body(
        "The API/Backend Layer is built on Next.js API routes and serves as the central coordination hub. It "
        "manages user sessions via NextAuth.js, persists project and test run data to PostgreSQL through Prisma "
        "ORM, enqueues test jobs onto Redis-backed BullMQ queues, and streams real-time test progress to the "
        "frontend via WebSockets. This layer also handles Stripe billing integration, GitHub App webhooks, and "
        "S3/R2 storage operations for screenshots, logs, and reports."
    ))
    story.append(body(
        "The Agent Orchestration Layer is where the core intelligence resides. It pulls jobs from the BullMQ "
        "queue, provisions sandboxed Docker containers or E2B instances, and dispatches the appropriate agents "
        "(Feature Discovery, Test Executor, Code Analysis, Fix Engine, Security, Media Verification) to perform "
        "their tasks. The Orchestrator manages the full test lifecycle, coordinating dependencies between features, "
        "handling retry logic, and merging results from multi-device test runs. LLM calls to Claude Sonnet 4 and "
        "GPT-4.1 Vision are routed through a multi-provider integration layer with prompt templates and caching."
    ))
    story.append(body(
        "The Infrastructure Layer provides the foundational compute and storage resources. The Next.js frontend "
        "is deployed on Vercel for global edge distribution, while the agent infrastructure runs on AWS or GCP "
        "with auto-scaling instance groups. PostgreSQL is hosted as a managed database service, Redis runs as a "
        "managed cache, and S3/R2 provides object storage. Docker containers for sandboxes are orchestrated "
        "on-demand, with instance pools pre-warmed to minimize cold-start latency."
    ))

    # 2.2 Technology Stack
    story.append(h2("2.2 Technology Stack"))
    story.append(spacer(4))
    tech_stack_headers = ["Category", "Technology", "Rationale"]
    tech_stack_rows = [
        ["Frontend", "Next.js 16 + TypeScript", "Full-stack React framework with SSR, API routes, and edge runtime support"],
        ["UI Library", "Tailwind CSS + shadcn/ui", "Utility-first CSS with accessible, composable component primitives"],
        ["Backend", "Next.js API Routes", "Unified codebase with frontend; serverless functions for API endpoints"],
        ["Database", "PostgreSQL", "Relational integrity, JSON support, mature ecosystem, excellent for complex queries"],
        ["ORM", "Prisma", "Type-safe database access, migrations, and schema management"],
        ["Agent Runtime", "Node.js / TypeScript", "Shared language with frontend, rich npm ecosystem for browser automation"],
        ["Sandbox", "Docker / E2B", "Isolated execution environments with full OS-level control and networking"],
        ["Browser Automation", "Playwright + CDP", "Cross-browser automation with DevTools Protocol for console/network access"],
        ["LLM (Code)", "Claude Sonnet 4", "Best-in-class code analysis, long context window, structured output support"],
        ["LLM (Vision)", "GPT-4.1 Vision", "Screenshot analysis, visual regression detection, UI state assessment"],
        ["LLM (Audio)", "Whisper", "Speech-to-text for audio verification and accessibility testing"],
        ["Job Queue", "Redis + BullMQ", "Reliable job queue with retries, priority, rate limiting, and event streaming"],
        ["Object Storage", "S3 / R2", "Durable storage for screenshots, logs, reports with CDN distribution"],
        ["Authentication", "NextAuth.js + GitHub OAuth", "Secure, simple GitHub-based auth with session management"],
        ["Payments", "Stripe", "Industry-standard billing with subscriptions, usage tracking, and webhooks"],
        ["Hosting (Frontend)", "Vercel", "Zero-config deployments, edge functions, preview environments"],
        ["Hosting (Agents)", "AWS / GCP", "Auto-scaling compute for sandbox provisioning and agent execution"],
    ]
    col_w = [1.1*inch, 1.8*inch, 3.6*inch]
    story.append(make_table(tech_stack_headers, tech_stack_rows, col_w))

    # 2.3 Data Flow
    story.append(spacer(12))
    story.append(h2("2.3 Data Flow"))
    story.append(body(
        "The complete test run lifecycle begins when a user initiates a test from the dashboard. The frontend "
        "sends a POST request to the /api/test-runs endpoint with the project ID and configuration. The API "
        "layer creates a TestRun record in PostgreSQL with a status of 'queued', generates a unique run "
        "identifier, and enqueues a job onto the BullMQ test-queue. The frontend immediately begins polling "
        "or listening on a WebSocket channel for real-time updates."
    ))
    story.append(body(
        "A worker process picks up the job from the queue and begins the orchestration sequence. First, it "
        "clones the user's repository into a temporary workspace. The Feature Discovery Agent then parses the "
        "codebase to identify routes, components, API endpoints, and user-facing features, building a dependency "
        "graph that determines the optimal test execution order. This feature map is stored in the database and "
        "streamed to the frontend for display."
    ))
    story.append(body(
        "The Orchestrator then provisions a sandboxed Docker container or E2B instance, launches the application "
        "within the sandbox, and starts Playwright with Chrome DevTools Protocol access. The Test Executor Agent "
        "systematically visits each feature, interacts with UI elements, monitors console output and network "
        "requests, and captures screenshots at each step. Results are streamed in real-time to the frontend "
        "through the WebSocket connection, enabling the Live View and Progress Feed displays."
    ))
    story.append(body(
        "When a test fails, the Code Analysis Agent is invoked to map the runtime error to its source code "
        "location. It examines the error message, stack trace, relevant source files, and console/network "
        "context to determine the root cause. If the Fix Engine Agent can generate a code diff that addresses "
        "the issue, the fix is presented to the user through the Fix Modal in the frontend. Upon user approval, "
        "the fix is applied to the workspace, the application is rebuilt and relaunched, and the test is "
        "re-executed. This fix-verify loop repeats until the feature passes or the user intervenes."
    ))
    story.append(body(
        "After all individual features are tested, the Orchestrator runs integration tests that verify "
        "cross-feature interactions. If all tests pass, the results are compiled into a comprehensive report "
        "stored in S3/R2, and the TestRun record is updated with a 'passed' status. For projects with GitHub "
        "App integration, the results are posted as a PR comment and the commit status is updated. The user "
        "can then review the full report from the dashboard or trigger a production push."
    ))

    # ─────────────────────────────────────────────────────────────
    # 3. AGENT SYSTEM DESIGN
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("3. Agent System Design"))
    story.append(spacer(6))
    story.append(body(
        "Probato's agent system is composed of seven specialized agents, each designed to handle a distinct "
        "aspect of the QA testing lifecycle. These agents are coordinated by a central Orchestrator that manages "
        "the overall test run, enforces dependency ordering, and handles error recovery. Each agent communicates "
        "through a shared event bus and maintains its own state within the test run context, allowing the "
        "Orchestrator to compose them into flexible workflows depending on the test scenario."
    ))

    # 3.1 Feature Discovery Agent
    story.append(h2("3.1 Feature Discovery Agent"))
    story.append(body(
        "The Feature Discovery Agent is responsible for parsing a codebase to identify all user-facing features "
        "that should be tested. For React and Next.js applications, it analyzes the routing configuration to "
        "map all accessible pages and their associated components. It traces component imports to build a "
        "dependency graph, identifies form submissions, API calls, and interactive elements such as buttons, "
        "modals, and navigation links. For each discovered feature, it generates a test specification that "
        "includes the feature name, the route or component path, the expected user interactions, and any "
        "dependencies on other features."
    ))
    story.append(body(
        "The agent uses a combination of static analysis and LLM-assisted interpretation. Static analysis "
        "handles deterministic patterns such as route definitions in Next.js pages or React Router "
        "configurations, while the LLM is used to interpret more ambiguous code structures, such as dynamic "
        "feature flags, conditional rendering logic, and complex state management patterns. The resulting "
        "feature map is presented to the user for review and adjustment before testing begins, ensuring that "
        "the agent's understanding aligns with the user's expectations."
    ))
    story.append(body(
        "The dependency graph built by the Feature Discovery Agent is critical for efficient test execution. "
        "Features that depend on authentication, for example, are tested after the login flow has been "
        "verified. Similarly, features that depend on data creation are ordered so that prerequisite data "
        "exists before dependent features are tested. This ordering prevents false negatives caused by testing "
        "features out of sequence, and it minimizes redundant setup and teardown operations."
    ))

    # 3.2 Test Executor Agent
    story.append(h2("3.2 Test Executor Agent"))
    story.append(body(
        "The Test Executor Agent is the primary driver of browser interaction. Built on Playwright with Chrome "
        "DevTools Protocol access, it navigates to URLs, clicks buttons, fills form fields, submits data, and "
        "verifies that the application responds as expected. Unlike traditional test automation frameworks that "
        "require pre-written scripts, the Test Executor Agent uses LLM guidance to determine which interactions "
        "to perform based on the feature specification and the current page state."
    ))
    story.append(body(
        "At each step of the test, the agent captures a screenshot, reads the DOM state, monitors console "
        "messages (including errors, warnings, and logs), and intercepts network requests and responses. This "
        "comprehensive observability enables the agent to detect not only obvious failures like error pages "
        "and broken layouts, but also subtle issues such as failed network requests that silently degrade "
        "functionality, console errors that indicate misconfigured libraries, and missing accessibility "
        "attributes that violate WCAG standards."
    ))
    story.append(body(
        "The agent maintains a step-by-step log of every action it takes, every element it interacts with, "
        "and every observation it makes. This log forms the basis of the Progress Feed displayed in the "
        "frontend, and it provides the Code Analysis Agent with the contextual information needed to diagnose "
        "failures. When the agent encounters an unexpected state, it can adapt its approach, trying alternative "
        "interactions or scrolling to find off-screen elements, before reporting a failure."
    ))

    # 3.3 Code Analysis Agent
    story.append(h2("3.3 Code Analysis Agent"))
    story.append(body(
        "The Code Analysis Agent bridges the gap between runtime observations and source code. When a test "
        "fails, it receives the error context from the Test Executor Agent, including the console errors, "
        "failed network requests, and DOM anomalies, along with the step that triggered the failure. Its "
        "primary task is to map these runtime signals back to the specific source files, functions, and lines "
        "of code that are responsible for the failure."
    ))
    story.append(body(
        "The agent leverages source maps to translate browser-reported locations back to original source "
        "code positions. It then reads the relevant source files, analyzes the control flow, and examines "
        "the surrounding code context to understand why the failure occurred. The LLM is used to reason "
        "about the relationship between the observed error and the code, producing a diagnostic report "
        "that includes the root cause, the affected code location, and a confidence score for the diagnosis."
    ))
    story.append(body(
        "Beyond direct code errors, the Code Analysis Agent is also designed to detect configuration and "
        "environment issues. If the console shows a 401 error from an API call, but the code appears "
        "correct, the agent checks for missing environment variables, misconfigured API endpoints, or "
        "expired authentication tokens. This 'beyond code' detection capability is essential for real-world "
        "applications where many failures are caused by deployment and configuration problems rather than "
        "code bugs."
    ))

    # 3.4 Fix Engine Agent
    story.append(h2("3.4 Fix Engine Agent"))
    story.append(body(
        "The Fix Engine Agent takes the diagnostic report from the Code Analysis Agent and generates a "
        "concrete code fix in the form of a unified diff. It reads the affected source file, understands "
        "the current implementation, and uses the LLM to produce a minimal, targeted change that addresses "
        "the identified root cause. The fix is designed to be as narrow as possible, avoiding unnecessary "
        "modifications that could introduce regressions."
    ))
    story.append(body(
        "Before presenting the fix to the user, the Fix Engine Agent performs a self-review. It verifies "
        "that the proposed change is syntactically valid, that it does not obviously break existing "
        "functionality, and that it aligns with the codebase's existing patterns and style. The fix, "
        "along with the diagnostic context, is then displayed in the Fix Modal in the frontend, where the "
        "user can review the diff, approve it, reject it, or request modifications."
    ))
    story.append(body(
        "If the user approves the fix, the agent applies the diff to the workspace, triggers a rebuild "
        "of the application, and instructs the Orchestrator to re-execute the failing test. If the test "
        "passes after the fix, the agent proceeds to the next failing feature. If the fix introduces a "
        "regression or fails to resolve the issue, the agent automatically rolls back the change and "
        "attempts an alternative approach. This fix-verify-rollback loop ensures that fixes are validated "
        "before they are considered final."
    ))

    # 3.5 Security Agent
    story.append(h2("3.5 Security Agent"))
    story.append(body(
        "The Security Agent systematically probes the application for common vulnerabilities. In its first "
        "iteration (Phase 4), it tests for unauthenticated access to protected routes, cross-site scripting "
        "(XSS) vulnerabilities in form fields and URL parameters, and input validation failures that could "
        "allow injection attacks. It attempts to submit malicious payloads in text fields, inject script tags "
        "in URL parameters, and access admin routes without valid credentials."
    ))
    story.append(body(
        "In its second iteration, the Security Agent expands its scope to include API security testing, "
        "cross-site request forgery (CSRF) detection, rate limiting verification, and insecure direct "
        "object reference (IDOR) testing. For API security, it examines whether endpoints properly validate "
        "authentication tokens, enforce authorization checks, and sanitize request payloads. For rate limiting, "
        "it sends rapid successive requests to sensitive endpoints to verify that the application throttles "
        "abusive traffic."
    ))
    story.append(body(
        "Security findings are classified by severity (Critical, High, Medium, Low) and reported with "
        "reproduction steps, the specific request or payload that triggered the vulnerability, and a "
        "recommended remediation. Unlike functional test failures, security findings are not automatically "
        "fixed; they are flagged for the user's security team to review and address, ensuring that security "
        "decisions remain under human control."
    ))

    # 3.6 Media Verification Agent
    story.append(h2("3.6 Media Verification Agent"))
    story.append(body(
        "The Media Verification Agent is responsible for testing media-rich features that traditional test "
        "automation frameworks struggle with. It verifies that images load correctly by checking for HTTP 200 "
        "responses and non-zero content dimensions, that videos play without errors by monitoring the "
        "HTMLVideoElement's readyState and error properties, and that audio content plays and produces the "
        "expected output by leveraging the Web Audio API to capture and analyze audio signals."
    ))
    story.append(body(
        "For audio verification specifically, the agent uses Whisper-based speech-to-text to transcribe "
        "the captured audio and verify that it matches the expected content. This enables testing of "
        "text-to-speech features, notification sounds, and voice call quality. The agent can also verify "
        "audio duration, sample rate, and channel configuration to ensure that media assets meet the "
        "application's requirements."
    ))
    story.append(body(
        "Video frame checking is performed by capturing individual frames at key timestamps and using "
        "GPT-4.1 Vision to verify that the visual content matches expectations. This is particularly "
        "useful for testing video playback features, animated transitions, and UI components that render "
        "dynamic visual content. Image load verification goes beyond simple HTTP status checks by also "
        "validating image dimensions, format, and rendering within the DOM to catch issues like broken "
        "image placeholders, CSS-hidden images, or incorrectly sized assets."
    ))

    # 3.7 Orchestrator
    story.append(h2("3.7 Orchestrator"))
    story.append(body(
        "The Orchestrator is the central coordinator that manages the entire test lifecycle. It receives "
        "the feature map from the Feature Discovery Agent, resolves dependencies to determine the optimal "
        "execution order, and dispatches tests to the appropriate agents. It manages sandbox provisioning "
        "and teardown, handles retry logic for transient failures, and coordinates the multi-agent workflow "
        "that includes testing, diagnosis, fixing, and re-testing."
    ))
    story.append(body(
        "For multi-device test scenarios, the Orchestrator provisions multiple sandboxes simultaneously and "
        "coordinates the actions of separate agent instances across those sandboxes. It manages "
        "synchronization points where Agent A on Device 1 must wait for Agent B on Device 2 to reach a "
        "specific state before proceeding. This coordination is essential for testing real-time features "
        "like messaging, calls, and notifications where actions on one device must produce observable "
        "effects on another."
    ))
    story.append(body(
        "The Orchestrator also implements adaptive test prioritization. If a critical feature like "
        "authentication fails, it deprioritizes dependent features that cannot be tested without a valid "
        "session. Conversely, if a minor visual issue is detected, it continues testing other features "
        "rather than blocking the entire test run. This intelligent prioritization maximizes test coverage "
        "even when early failures would otherwise halt progress, and it provides users with a more complete "
        "picture of their application's quality."
    ))

    # ─────────────────────────────────────────────────────────────
    # 4. TEST SITE ARCHITECTURE
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("4. Test Site Architecture"))
    story.append(spacer(6))

    story.append(h2("4.1 Sandboxed Browser Environment"))
    story.append(body(
        "The sandboxed browser environment is the foundation of Probato's testing infrastructure. Each test "
        "run provisions an isolated Docker container or E2B instance that runs the user's application with "
        "full network isolation and resource constraints. The sandbox includes a pre-installed Chrome browser "
        "with Playwright automation and Chrome DevTools Protocol access, enabling the agent to interact with "
        "the application exactly as a human user would, while also gaining deep visibility into the browser's "
        "internal state."
    ))
    story.append(body(
        "Sandbox provisioning is optimized for speed. A pool of pre-warmed containers is maintained, each "
        "with the base operating system, Chrome, and Playwright already installed. When a test job is "
        "dequeued, the system selects a pre-warmed container, clones the user's repository, installs "
        "dependencies, builds the application, and starts the development server. This approach reduces "
        "the cold-start time from minutes to seconds, enabling test runs to begin quickly after the user "
        "clicks the start button."
    ))
    story.append(body(
        "Each sandbox is configured with specific resource limits: CPU shares, memory caps, and network "
        "bandwidth restrictions. These limits prevent a single test run from consuming excessive resources "
        "and ensure fair resource allocation across concurrent test runs. The sandbox also includes "
        "monitoring agents that track CPU usage, memory consumption, and disk I/O, providing infrastructure "
        "metrics that are included in the test report."
    ))

    story.append(h2("4.2 DevTools Integration"))
    story.append(body(
        "Chrome DevTools Protocol (CDP) integration is what enables Probato's agents to achieve deep "
        "observability into the application's runtime behavior. Through CDP, the Test Executor Agent can "
        "subscribe to console events (logs, warnings, errors), monitor network requests and responses in "
        "real-time, inspect the DOM tree and element properties, and intercept JavaScript execution. This "
        "level of access goes far beyond what traditional UI automation frameworks can observe."
    ))
    story.append(body(
        "Console monitoring captures all messages logged by the application, including those from "
        "third-party libraries. The agent filters and categorizes these messages, flagging errors and "
        "warnings that indicate potential problems while ignoring benign informational logs. Network "
        "monitoring tracks every HTTP request and response, recording the URL, method, status code, "
        "headers, and response body for API calls, asset loads, and WebSocket connections. This enables "
        "detection of failed API calls, slow responses, and incorrect content types."
    ))
    story.append(body(
        "DOM inspection allows the agent to verify that elements exist, have the expected attributes, "
        "and are in the expected state. This is particularly useful for testing dynamic applications "
        "where the DOM changes in response to user interactions, API responses, or state transitions. "
        "The agent can query for specific elements, read their properties, and compare them against "
        "expected values, providing a much richer verification layer than simple screenshot comparison."
    ))

    story.append(h2("4.3 Viewing Modes"))
    story.append(body(
        "Probato provides three viewing modes for monitoring test runs, each designed for a different "
        "level of engagement. The Live View mode displays the real-time browser screen exactly as the "
        "agent sees it, along with a developer console showing live log output and a network panel "
        "displaying requests and responses as they occur. This mode is ideal for users who want to "
        "closely follow the agent's actions and understand exactly how their application is being tested."
    ))
    story.append(body(
        "The Progress Feed mode provides a step-by-step log of the agent's actions, with each step "
        "showing the action taken (e.g., 'Clicked Submit button on /login'), the result (e.g., "
        "'Page navigated to /dashboard'), and any observations (e.g., 'Console error: Auth token expired'). "
        "This mode is well-suited for users who want to track progress at a higher level without watching "
        "every browser interaction, and it provides an excellent audit trail for post-run analysis."
    ))
    story.append(body(
        "The Summary Only mode displays a high-level overview with feature-level pass/fail status, "
        "overall progress percentage, and any critical errors that require attention. This mode is "
        "designed for users who are running routine tests and want to be notified only when something "
        "goes wrong. All three modes can be switched between at any time during a test run, and the "
        "complete Progress Feed is always available after the run completes for detailed review."
    ))

    story.append(h2("4.4 User Intervention"))
    story.append(body(
        "While Probato's agents are designed to operate autonomously, the platform recognizes that human "
        "judgment is sometimes necessary. The 'Take Over' button allows users to pause the agent, assume "
        "direct control of the browser within the sandbox, and perform manual actions. This is useful in "
        "situations where the agent is stuck in a loop, where the application requires human-only "
        "verification such as CAPTCHA completion, or where the user wants to demonstrate a specific "
        "reproduction step to the agent."
    ))
    story.append(body(
        "When the user takes over, the agent suspends its automated actions but continues monitoring "
        "console output, network requests, and DOM changes. The user's manual interactions are recorded "
        "in the Progress Feed alongside the agent's automated actions, providing a complete timeline of "
        "both human and AI-driven testing. When the user releases control, the agent resumes from the "
        "current application state, adapting its test plan to account for any changes made during the "
        "manual intervention period."
    ))
    story.append(body(
        "The intervention system also supports a collaborative mode where the user and agent can "
        "alternate turns. For example, the user might complete a CAPTCHA manually, then instruct the "
        "agent to continue testing from the authenticated state. This hybrid approach combines the "
        "efficiency of automated testing with the flexibility of human judgment, ensuring that even "
        "applications with anti-automation measures can be thoroughly tested."
    ))

    # ─────────────────────────────────────────────────────────────
    # 5. CUSTOMER ACCESS FLOW
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("5. Customer Access Flow"))
    story.append(spacer(6))

    story.append(h2("5.1 Landing Page"))
    story.append(body(
        "The landing page serves as the primary entry point for new users and the public face of Probato. "
        "It features a compelling hero section with a clear value proposition, an animated demo showing "
        "the agent in action, and a prominent call-to-action button that redirects to GitHub OAuth signup. "
        "Below the hero, the page presents feature highlights explaining what makes Probato different from "
        "traditional testing tools, including its autonomous nature, fix-verify loop, and multi-device "
        "testing capabilities."
    ))
    story.append(body(
        "The pricing section displays three tiers: Free (limited test runs per month), Pro (unlimited runs "
        "with priority access), and Enterprise (custom infrastructure, dedicated support, and SLA guarantees). "
        "Each tier is presented in a clear comparison table with feature checkmarks. Testimonials from early "
        "users and case studies demonstrating measurable QA improvements reinforce the platform's credibility. "
        "The page is built with performance in mind, achieving a Lighthouse score above 95 through lazy "
        "loading, image optimization, and minimal JavaScript bundle size."
    ))

    story.append(h2("5.2 Signup and Authentication"))
    story.append(body(
        "Probato uses GitHub OAuth as its primary authentication mechanism, implemented through NextAuth.js. "
        "This choice is intentional: Probato's core workflow requires access to the user's GitHub repositories, "
        "and GitHub OAuth provides the necessary repository access tokens as part of the authentication flow. "
        "Users sign up with a single click, granting read access to their repositories and write access for "
        "posting commit statuses and PR comments."
    ))
    story.append(body(
        "Session management is handled via JWT tokens stored in HTTP-only cookies, with refresh token rotation "
        "for long-lived sessions. The authentication system supports team organizations, allowing multiple users "
        "to share access to the same projects and test runs. Role-based access control (Owner, Admin, Member, "
        "Viewer) governs what actions each team member can perform, from creating projects to approving fixes "
        "to managing billing."
    ))

    story.append(h2("5.3 Onboarding"))
    story.append(body(
        "After signup, the user is guided through a streamlined onboarding flow that collects the information "
        "needed to start their first test run. Step one asks the user to connect a GitHub repository by "
        "selecting from their available repositories or entering a URL. Step two asks for the project type "
        "(React, Next.js, Vue, Angular, or Other) to help the Feature Discovery Agent apply the appropriate "
        "parsing heuristics. Step three lets the user choose a testing mode: Quick (smoke test key features), "
        "Standard (test all features), or Comprehensive (all features plus security and accessibility audits)."
    ))
    story.append(body(
        "The onboarding flow is designed to be completed in under two minutes. Default values are pre-selected "
        "where possible, and the system auto-detects the project type by examining the repository's package.json "
        "and directory structure. After onboarding, the user lands on their project page where they can review "
        "the discovered features, adjust the test plan, and start their first test run with a single click."
    ))

    story.append(h2("5.4 Dashboard"))
    story.append(body(
        "The dashboard is the central hub for managing projects and monitoring test activity. It displays a "
        "list of the user's projects, each showing the most recent test run status (passed, failed, running), "
        "the number of features tested, and the time of the last run. A sidebar provides navigation to "
        "projects, test history, usage statistics, team settings, and billing. The main content area shows "
        "a summary of recent activity, including test run completions, new failures, and fix recommendations."
    ))
    story.append(body(
        "Usage statistics display the number of test runs consumed this billing period, the average test run "
        "duration, the pass rate trend over time, and the most frequently failing features. These metrics "
        "help users understand their testing patterns and identify areas where the application may need "
        "additional development attention. The dashboard supports filtering by project, date range, and "
        "status, enabling users to quickly find specific test runs."
    ))

    story.append(h2("5.5 Test Run Page"))
    story.append(body(
        "The Test Run Page is the most feature-rich view in the platform, providing real-time visibility "
        "into an active test run. The page is divided into three main areas: the main content area (which "
        "displays the selected viewing mode: Live View, Progress Feed, or Summary), the Feature Status "
        "sidebar (showing the pass/fail/pending status of each feature), and the Fix Modal (which appears "
        "when the Fix Engine Agent has a recommendation)."
    ))
    story.append(body(
        "In Live View mode, the main content area shows the real-time browser screen from the sandbox, "
        "with a developer console below it displaying live log output. The user can see the agent's cursor "
        "moving across the page, clicking buttons, and typing text, providing complete transparency into "
        "the testing process. In Progress Feed mode, the area displays a chronological log of agent actions "
        "with expandable detail sections. In Summary mode, only feature-level results and critical errors "
        "are shown."
    ))
    story.append(body(
        "The Feature Status sidebar provides a tree view of all discovered features, with icons indicating "
        "their current status: pending (gray), running (animated spinner), passed (green check), or failed "
        "(red X). Clicking on a feature scrolls the main content to the relevant section of the Progress "
        "Feed or highlights the feature in Live View. When a fix recommendation is available, the Fix "
        "Modal slides in from the right, displaying the code diff, the diagnostic context, and Approve/Reject "
        "buttons."
    ))

    story.append(h2("5.6 Reports"))
    story.append(body(
        "After a test run completes, Probato generates a comprehensive report that summarizes the results "
        "across all tested features. The report includes an executive summary with overall pass/fail counts, "
        "a detailed feature-by-feature breakdown with screenshots at each step, a list of all console errors "
        "and network failures observed during the run, and a security findings section if the Security Agent "
        "was active. Reports are stored in S3/R2 and can be downloaded as PDF or shared via a unique URL."
    ))
    story.append(body(
        "For teams using the GitHub App integration, the report is automatically posted as a PR comment "
        "with a condensed summary and a link to the full report. The commit status is also updated to "
        "reflect the test result, enabling CI/CD pipelines to gate merges on Probato's test results. "
        "Historical reports are retained indefinitely for Pro and Enterprise users, while Free tier users "
        "have access to the last 30 days of reports."
    ))

    # ─────────────────────────────────────────────────────────────
    # 6. MULTI-DEVICE TESTING ARCHITECTURE
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("6. Multi-Device Testing Architecture"))
    story.append(spacer(6))

    story.append(h2("6.1 Orchestrator Design"))
    story.append(body(
        "The multi-device Orchestrator extends the standard Orchestrator to coordinate test execution across "
        "multiple sandboxes simultaneously. Each sandbox represents a separate device with its own browser "
        "instance, its own application state, and its own dedicated agent. The Orchestrator maintains a "
        "shared state machine that tracks the progress of each agent and enforces synchronization points "
        "where agents must wait for each other before proceeding."
    ))
    story.append(body(
        "The synchronization protocol uses a publish-subscribe model over Redis channels. When Agent A "
        "performs an action that should produce an observable effect on Agent B's device (such as sending "
        "a message), it publishes a 'milestone reached' event with the relevant context. Agent B subscribes "
        "to these milestone events and waits until the expected state change is observed on its device before "
        "proceeding. This ensures that cross-device interactions are tested reliably, without race conditions "
        "or timing-dependent flakiness."
    ))
    story.append(body(
        "The Orchestrator also handles device-specific configuration, including viewport sizes, user agent "
        "strings, and network conditions. This enables testing of responsive designs, mobile-specific "
        "behaviors, and degraded network scenarios. Each sandbox can be configured independently, allowing "
        "the same test to be run across different device profiles simultaneously."
    ))

    story.append(h2("6.2 Messaging Testing"))
    story.append(body(
        "Messaging testing verifies that messages sent from one device are correctly received and displayed "
        "on another. Agent A composes and sends a message through the application's messaging interface, "
        "while Agent B monitors its inbox for the incoming message. The Orchestrator synchronizes the two "
        "agents: Agent A waits for confirmation that Agent B has received the message before proceeding, "
        "and Agent B verifies the message content, sender information, and timestamp match the expected values."
    ))
    story.append(body(
        "The testing covers various message types (text, images, files, emojis), edge cases (empty messages, "
        "extremely long messages, special characters), and network conditions (messages sent while offline, "
        "messages delivered after reconnection). The agents also verify that real-time indicators such as "
        "typing notifications, read receipts, and online status updates are correctly transmitted between "
        "devices."
    ))

    story.append(h2("6.3 Call Testing"))
    story.append(body(
        "Call testing simulates a complete voice call flow between two devices: dialing, ringing, answering, "
        "speaking, and hanging up. Agent A initiates a call to Agent B's account. Agent B detects the "
        "incoming call notification, answers it, and the agents verify that the call is established with "
        "bidirectional audio. The Media Verification Agent captures audio from both endpoints and uses "
        "Whisper to verify that speech transmitted from one device is audible on the other."
    ))
    story.append(body(
        "The call testing infrastructure also handles edge cases such as declined calls, calls that go "
        "unanswered, calls that are interrupted by network disconnections, and calls that are transferred "
        "to another participant. Audio quality metrics including latency, jitter, and packet loss are "
        "measured and included in the test report. These metrics help users identify VoIP quality issues "
        "that would be difficult to detect through manual testing."
    ))

    story.append(h2("6.4 Notification Testing"))
    story.append(body(
        "Notification testing verifies that push notifications and in-app notifications are correctly "
        "delivered across devices. This includes testing notifications triggered by direct actions (such as "
        "a message notification when Agent A sends a message to Agent B) and system-generated notifications "
        "(such as payment confirmations or friend requests). The agents verify both the content of the "
        "notification and its timing, ensuring that notifications are delivered promptly and contain the "
        "correct information."
    ))
    story.append(body(
        "A particularly challenging scenario is testing notifications when the receiving device's screen "
        "is off or the application is in the background. The Orchestrator simulates these states by "
        "minimizing the browser window or switching the application's visibility state, then verifies that "
        "notifications are still received and that the application correctly updates its state when the "
        "user returns. This ensures that background notification handling works correctly across different "
        "operating system behaviors."
    ))

    story.append(h2("6.5 Payment Testing"))
    story.append(body(
        "Payment testing exercises the complete checkout flow using Stripe's test mode, which provides "
        "special test card numbers that simulate successful charges, declined cards, and various error "
        "conditions. The Test Executor Agent navigates through the product selection, cart, checkout, and "
        "payment confirmation steps, using test card numbers to complete or intentionally fail the transaction."
    ))
    story.append(body(
        "Edge cases tested include expired cards, insufficient funds, incorrect CVV, duplicate charges, "
        "refund processing, and subscription lifecycle events (creation, renewal, cancellation, upgrade, "
        "downgrade). The agent also verifies that the application correctly handles Stripe webhooks for "
        "asynchronous payment events, such as charge.dispute.created or invoice.payment_failed. "
        "All payment testing is performed exclusively with Stripe's test mode keys, ensuring that no real "
        "financial transactions occur during testing."
    ))

    # ─────────────────────────────────────────────────────────────
    # 7. ADMIN PANEL
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("7. Admin Panel"))
    story.append(spacer(6))

    story.append(h2("7.1 User Management"))
    story.append(body(
        "The admin panel provides a comprehensive user management interface for platform administrators. "
        "It displays a searchable, paginated list of all registered users with their email, GitHub username, "
        "account tier, creation date, and last activity timestamp. Administrators can view detailed user "
        "profiles showing their projects, test run history, resource consumption, and billing status. User "
        "accounts can be suspended, reactivated, or upgraded manually, and administrators can impersonate "
        "users for debugging purposes with an audit log entry recording the action."
    ))
    story.append(body(
        "The user management system also handles team and organization management. Administrators can view "
        "all teams, their members, and their shared projects. They can reassign project ownership, merge "
        "duplicate teams, and resolve access conflicts. A usage dashboard shows per-user and per-team "
        "resource consumption, enabling administrators to identify heavy users and enforce fair use policies."
    ))

    story.append(h2("7.2 Infrastructure Monitoring"))
    story.append(body(
        "The infrastructure monitoring dashboard provides real-time visibility into the platform's "
        "computational resources. It displays the number of active sandboxes, the pre-warmed container "
        "pool size, the current queue depth for pending test jobs, and the average job wait time. Resource "
        "utilization charts show CPU, memory, and network usage across the agent infrastructure, with "
        "alerts triggered when utilization exceeds configurable thresholds."
    ))
    story.append(body(
        "The monitoring system also tracks LLM API usage, including the number of tokens consumed per "
        "provider, the average response latency, and the error rate. This data is essential for cost "
        "management and capacity planning. Administrators can set per-user and per-team rate limits on "
        "LLM consumption, and the system automatically queues or throttles requests when limits are "
        "approached. Historical infrastructure metrics are retained for 90 days for trend analysis and "
        "capacity forecasting."
    ))

    story.append(h2("7.3 Billing and Subscriptions"))
    story.append(body(
        "The billing section integrates with Stripe to manage user subscriptions, track usage, and "
        "process payments. It displays a list of all active subscriptions with their tier, billing cycle, "
        "next renewal date, and monthly usage. Administrators can manually adjust subscription tiers, "
        "apply discount codes, extend trial periods, and issue refunds. The billing system supports "
        "prorated upgrades and downgrades, with Stripe handling the complex calculation of partial-month "
        "charges."
    ))
    story.append(body(
        "Usage-based billing for the Pro and Enterprise tiers tracks the number of test runs, LLM tokens "
        "consumed, and sandbox hours used. These metrics are aggregated daily and synced with Stripe as "
        "metered billing events. Administrators can view detailed billing breakdowns per user, identify "
        "anomalous usage patterns, and configure alerts for cost spikes. The billing system also handles "
        "failed payment recovery, sending automated reminders and applying grace periods before "
        "downgrading accounts."
    ))

    story.append(h2("7.4 Agent Performance Metrics"))
    story.append(body(
        "The agent performance dashboard tracks the effectiveness and efficiency of Probato's AI agents. "
        "Key metrics include: the Feature Discovery Agent's coverage rate (percentage of real features "
        "discovered vs. total features), the Test Executor Agent's success rate (percentage of tests "
        "completed without agent errors), the Code Analysis Agent's diagnostic accuracy (percentage of "
        "diagnoses confirmed correct by the Fix Engine), and the Fix Engine Agent's fix success rate "
        "(percentage of applied fixes that pass re-testing)."
    ))
    story.append(body(
        "These metrics are aggregated across all test runs and segmented by project type, technology "
        "stack, and application complexity. They provide actionable insights for improving the agents' "
        "performance over time. For example, if the diagnostic accuracy for Vue.js applications is lower "
        "than for React applications, the team can focus on improving the Code Analysis Agent's Vue.js "
        "understanding. The dashboard also tracks cost-per-test-run metrics, helping the team optimize "
        "LLM prompt efficiency and reduce operational costs."
    ))

    # ─────────────────────────────────────────────────────────────
    # 8. DESIGN SYSTEM
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("8. Design System"))
    story.append(spacer(6))

    story.append(h2("8.1 Color Palette"))
    story.append(spacer(4))
    color_headers = ["Color Name", "Hex Value", "Usage"]
    color_rows = [
        ["Deep Indigo", "#1E1B4B", "Primary brand color; headings, nav, primary buttons"],
        ["Electric Violet", "#7C3AED", "Secondary brand color; links, accents, highlights"],
        ["Emerald", "#10B981", "Success states; passed tests, confirmations, positive indicators"],
        ["Warm Red", "#EF4444", "Danger states; failed tests, errors, destructive actions"],
        ["Amber", "#F59E0B", "Warning states; pending tests, caution indicators, alerts"],
        ["Off-White", "#F8FAFC", "Background; page backgrounds, card surfaces"],
    ]
    col_w_color = [1.3*inch, 1.2*inch, 4.0*inch]
    story.append(make_table(color_headers, color_rows, col_w_color))

    story.append(spacer(12))
    story.append(h2("8.2 Typography"))
    story.append(body(
        "Probato uses a dual-typeface system that balances readability with technical precision. Inter is "
        "the primary typeface for all headings and body text. It is a highly legible sans-serif designed "
        "specifically for computer screens, with features like a tall x-height, open apertures, and "
        "distinguishable character shapes that ensure clarity even at small sizes. Inter is used for "
        "everything from page titles and section headings to body paragraphs and button labels."
    ))
    story.append(body(
        "JetBrains Mono is the monospace typeface used for all code-related content, including code blocks "
        "in the Fix Modal, console output in the Live View, API endpoint URLs, and terminal commands. "
        "JetBrains Mono was designed for developers, with features like increased character distinction "
        "(easily distinguishable Il1 and O0), ligatures for common programming operators, and a consistent "
        "stroke width that renders clearly on all display densities."
    ))
    story.append(body(
        "The typographic scale follows a modular approach: page titles at 28px bold, section headings at "
        "22px bold, sub-section headings at 16px semibold, body text at 14px regular, and captions at "
        "12px regular. Line heights are set at 1.5x the font size for body text and 1.2x for headings, "
        "ensuring comfortable reading across all content types. Code blocks use a slightly smaller font "
        "size (13px) with increased letter spacing for improved readability."
    ))

    story.append(h2("8.3 Layout Principles"))
    story.append(body(
        "Probato's layout system is built on a 12-column grid with a 24px gutter, implemented using "
        "Tailwind CSS's responsive utility classes. The design follows a content-first approach where "
        "the layout adapts to the content rather than forcing content into rigid containers. Key layout "
        "patterns include: full-width hero sections on the landing page, sidebar-and-content layouts for "
        "the dashboard and project pages, and split-pane layouts for the Test Run Page with resizable "
        "dividers."
    ))
    story.append(body(
        "Spacing follows an 8px base unit system. All margins, paddings, and gaps are multiples of 8px "
        "(8, 16, 24, 32, 48, 64), creating a consistent visual rhythm throughout the application. "
        "Card components use a 16px internal padding with 24px spacing between cards. The maximum "
        "content width is 1280px, centered on larger screens with equal margins on both sides."
    ))
    story.append(body(
        "The layout is fully responsive, with three breakpoints: mobile (below 768px), tablet (768px to "
        "1024px), and desktop (above 1024px). On mobile, the sidebar collapses into a hamburger menu, "
        "the split-pane Test Run Page stacks vertically, and table data switches to a card-based layout. "
        "The Live View mode is optimized for desktop screens where the full browser and console can be "
        "displayed side by side, while mobile users default to the Progress Feed view."
    ))

    # ─────────────────────────────────────────────────────────────
    # 9. IMPLEMENTATION ROADMAP
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("9. Implementation Roadmap"))
    story.append(spacer(6))
    story.append(body(
        "Probato's development is organized into eight phases spanning 52 weeks. Each phase has a clear "
        "goal, defined deliverables, and measurable test parameters that determine whether the phase has "
        "been successfully completed. The phases are sequenced so that each one builds on the capabilities "
        "delivered by the previous phase, with early phases focusing on core infrastructure and agent "
        "capabilities, and later phases adding user-facing features, advanced testing, and scale."
    ))

    # Phase 0
    story.append(h2("9.1 Phase 0: Foundation (Weeks 1-4)"))
    story.append(body(
        "The Foundation phase establishes the project infrastructure, development environment, and basic "
        "framework upon which all subsequent phases depend. Week 1 focuses on repository setup, initializing "
        "the Next.js project with TypeScript, Tailwind CSS, and shadcn/ui, configuring CI/CD pipelines for "
        "automated testing and deployment, designing the initial database schema in Prisma, and implementing "
        "GitHub OAuth authentication through NextAuth.js. By the end of week 1, developers can sign up via "
        "GitHub, and the deployment pipeline is operational."
    ))
    story.append(body(
        "Week 2 builds the sandbox infrastructure. This involves setting up Docker container orchestration "
        "for isolated test environments, integrating Playwright for browser automation within containers, "
        "and implementing basic navigation and interaction capabilities. The sandbox should be able to launch "
        "a web application, navigate to a URL, and capture a screenshot by the end of this week."
    ))
    story.append(body(
        "Week 3 establishes the LLM integration layer. A multi-provider abstraction supports Claude Sonnet 4 "
        "for code analysis, GPT-4.1 Vision for screenshot analysis, and Whisper for audio transcription. "
        "Prompt templates are created for common agent tasks, and a caching layer reduces redundant LLM calls. "
        "Week 4 delivers the first version of the Feature Discovery Agent, which parses React and Next.js "
        "applications to identify routes, components, and features, building a basic dependency graph for test "
        "ordering."
    ))

    # Phase 1
    story.append(h2("9.2 Phase 1: Core Testing Agent (Weeks 5-10)"))
    story.append(body(
        "The Core Testing Agent phase delivers the Test Executor Agent that can autonomously interact with web "
        "applications. Weeks 5-6 focus on building the agent's core interaction capabilities: navigating to "
        "URLs, clicking buttons, filling form fields, submitting forms, and reading page content. The agent "
        "uses LLM guidance to determine which elements to interact with based on the feature specification "
        "and the current page state, rather than relying on pre-written selectors or scripts."
    ))
    story.append(body(
        "Weeks 7-8 integrate Chrome DevTools Protocol for deep observability. The agent subscribes to console "
        "events, monitors network requests and responses, and inspects the DOM state at each step. Console "
        "errors are categorized by severity, network failures are captured with full request/response details, "
        "and DOM snapshots are taken at key interaction points for post-run analysis."
    ))
    story.append(body(
        "Week 9 implements feature-level test orchestration, where the Orchestrator executes tests for each "
        "discovered feature in dependency order, respecting the graph built by the Feature Discovery Agent. "
        "Week 10 delivers basic reporting with pass/fail status per feature, captured console errors, "
        "screenshots at each step, and a summary report that can be downloaded as a PDF. By the end of this "
        "phase, the agent can complete a 5-feature test on a sample React application."
    ))

    # Phase 2
    story.append(h2("9.3 Phase 2: Code Fix Loop (Weeks 11-16)"))
    story.append(body(
        "The Code Fix Loop phase gives the agent the ability to diagnose failures and recommend or apply fixes. "
        "Weeks 11-12 build the Code Analysis Agent, which maps runtime errors to source code locations using "
        "source maps, examines the relevant code context, and produces diagnostic reports with root cause "
        "analysis and confidence scores. The agent handles not only direct code errors but also configuration "
        "and environment issues that manifest as runtime failures."
    ))
    story.append(body(
        "Weeks 13-14 implement the Fix Engine Agent, which generates code diffs based on the diagnostic "
        "reports. The agent performs self-review on proposed fixes to check for syntax errors, style "
        "consistency, and potential regressions before presenting them to the user. The Fix Modal in the "
        "frontend displays the diff with syntax highlighting, the diagnostic context, and Approve/Reject "
        "buttons."
    ))
    story.append(body(
        "Week 15 implements the fix-verify loop: after a fix is approved and applied, the application is "
        "rebuilt and the failing test is re-executed. If the fix works, the agent proceeds; if not, it "
        "rolls back and tries an alternative approach. Week 16 adds 'beyond code' detection, enabling the "
        "agent to identify database schema mismatches, missing environment variables, and misconfigured "
        "build settings as root causes of test failures."
    ))

    # Phase 3
    story.append(h2("9.4 Phase 3: Landing Page + Dashboard (Weeks 17-22)"))
    story.append(body(
        "This phase builds the user-facing web platform. Weeks 17-18 deliver the landing page with its hero "
        "section, animated demo, feature highlights, pricing tiers, and CTA that redirects to GitHub OAuth. "
        "The landing page is optimized for performance and conversion, with a Lighthouse score above 95 and "
        "A/B testing support for the CTA button placement and messaging."
    ))
    story.append(body(
        "Weeks 19-20 build the user dashboard, including the project list, test history, usage statistics, "
        "and team management. The dashboard provides a clear overview of testing activity with filtering "
        "and search capabilities. Weeks 21-22 deliver the Test Run Page, the most complex view in the "
        "platform. Week 21 implements the Live View mode with real-time browser streaming and developer "
        "console, and Week 22 adds the Progress Feed mode, Fix Modal, and Feature Status sidebar."
    ))

    # Phase 4
    story.append(h2("9.5 Phase 4: Media + Security Testing (Weeks 23-28)"))
    story.append(body(
        "The Media and Security Testing phase extends the agent's capabilities beyond functional testing. "
        "Weeks 23-24 build the Media Verification Agent, which checks image loads (HTTP status, dimensions, "
        "rendering), video playback (readyState, error events, frame integrity), and audio capture (Web Audio "
        "API signal analysis). Week 25 adds audio verification through Whisper-based speech-to-text, enabling "
        "the agent to verify that audio content matches expected transcripts."
    ))
    story.append(body(
        "Week 26 delivers the first version of the Security Agent, testing for unauthenticated access to "
        "protected routes, XSS vulnerabilities in form fields and URL parameters, and input validation "
        "failures. The agent systematically probes the application with malicious payloads and reports "
        "vulnerabilities with severity classifications and reproduction steps."
    ))
    story.append(body(
        "Weeks 27-28 expand the Security Agent to cover API security (authentication, authorization, payload "
        "validation), CSRF detection, rate limiting verification, and IDOR testing. The agent examines API "
        "endpoints for improper access controls and tests whether changing resource IDs in requests allows "
        "access to other users' data. All security findings are reported separately from functional test "
        "results, with clear severity ratings and remediation recommendations."
    ))

    # Phase 5
    story.append(h2("9.6 Phase 5: Multi-Device + Advanced Testing (Weeks 29-36)"))
    story.append(body(
        "The Multi-Device Testing phase enables the orchestrator to coordinate multiple sandboxes "
        "simultaneously. Weeks 29-30 build the multi-sandbox orchestrator with its synchronization protocol "
        "and shared state machine. The orchestrator provisions separate sandboxes for each device, assigns "
        "dedicated agent instances, and manages the cross-device milestone event system that ensures agents "
        "wait for each other at synchronization points."
    ))
    story.append(body(
        "Weeks 31-32 implement messaging and notification testing across devices. Agent A sends messages that "
        "Agent B receives and verifies, with real-time delivery confirmation. The agents test various message "
        "types, offline message queuing, and typing indicators. Weeks 33-34 add call testing with audio "
        "verification between devices, including dialing, ringing, answering, and hanging up, plus screen-off "
        "notification testing that simulates backgrounded application states."
    ))
    story.append(body(
        "Weeks 35-36 deliver payment testing using Stripe test mode. The agent navigates the complete "
        "checkout flow, tests with various Stripe test cards for success, decline, and error scenarios, "
        "and verifies webhook handling for asynchronous payment events. All payment testing is strictly "
        "confined to Stripe's test environment, with safeguards to prevent accidental real transactions."
    ))

    # Phase 6
    story.append(h2("9.7 Phase 6: Integration + Polish (Weeks 37-44)"))
    story.append(body(
        "The Integration and Polish phase connects Probato with external tools and prepares the platform for "
        "public launch. Weeks 37-38 build the GitHub App integration, enabling Probato to post test results "
        "as PR comments, update commit statuses, and trigger test runs automatically when PRs are opened. "
        "This integration turns Probato into a continuous quality gate that runs on every code change."
    ))
    story.append(body(
        "Weeks 39-40 deliver the admin panel with its user management, infrastructure monitoring, billing "
        "dashboard, and agent performance metrics views. The admin panel provides the operational visibility "
        "needed to run Probato as a production service at scale. Weeks 41-42 integrate Stripe billing for "
        "the Free, Pro, and Enterprise tiers, including subscription management, usage-based metering, and "
        "automated invoicing."
    ))
    story.append(body(
        "Weeks 43-44 focus on open-source preparation: cleaning up the codebase for public visibility, "
        "writing comprehensive documentation, creating a CLI tool for self-hosted deployments, and "
        "establishing contribution guidelines. The CLI tool allows users to run Probato locally with their "
        "own infrastructure, lowering the barrier to adoption for security-conscious teams that cannot use "
        "the cloud-hosted version."
    ))

    # Phase 7
    story.append(h2("9.8 Phase 7: Launch + Scale (Weeks 45-52)"))
    story.append(body(
        "The Launch and Scale phase brings Probato to the public market. Weeks 45-46 run a closed beta "
        "with 50 selected users, collecting detailed feedback on agent accuracy, test run reliability, UI "
        "usability, and feature completeness. Bugs discovered during beta are prioritized and fixed, and "
        "agent prompt templates are refined based on real-world usage patterns."
    ))
    story.append(body(
        "Weeks 47-48 focus on performance optimization. LLM response caching reduces redundant API calls "
        "and cuts per-run costs. Test pattern caching stores previously discovered features and test "
        "strategies so that re-running tests on unchanged code is faster. Spot instances and auto-scaling "
        "groups reduce compute costs during off-peak hours. The target is an average test run time under "
        "30 minutes for a 10-feature application and an LLM cost per run under $0.50."
    ))
    story.append(body(
        "Weeks 49-50 execute the public launch: Product Hunt launch, Hacker News post, developer community "
        "outreach on Twitter/X, Reddit, and Discord, and partnerships with testing and DevOps influencers. "
        "The goal is 500+ signups from the launch. Weeks 51-52 begin research on mobile app testing support, "
        "exploring Android emulators, iOS simulators, and Appium integration for the v2 roadmap. Long-term "
        "infrastructure planning for 10,000+ concurrent users is also conducted during this period."
    ))

    # ─────────────────────────────────────────────────────────────
    # 10. QUALITY ASSURANCE PARAMETERS
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("10. Quality Assurance Parameters"))
    story.append(spacer(6))
    story.append(body(
        "Each phase of the implementation roadmap has specific test parameters that define what must be "
        "verified before the phase is considered complete. These parameters are objective, measurable, and "
        "directly tied to the phase's key deliverables. The following table summarizes the quality assurance "
        "parameters for all eight phases, providing clear success criteria that the engineering team can "
        "validate."
    ))
    story.append(spacer(4))

    qa_headers = ["Phase", "Key Deliverable", "Test Parameter", "Success Criteria"]
    qa_rows = [
        ["Phase 0", "Foundation", "User signup via GitHub OAuth", "User can sign up and reach dashboard"],
        ["Phase 0", "Foundation", "Repo clone into sandbox", "Repository cloned and app launched in container"],
        ["Phase 0", "Foundation", "Playwright browser automation", "Agent can launch browser and navigate web app"],
        ["Phase 0", "Foundation", "LLM code analysis", "LLM correctly analyzes a simple code snippet"],
        ["Phase 1", "Core Testing Agent", "Login form interaction", "Agent navigates to login and fills credentials"],
        ["Phase 1", "Core Testing Agent", "Network error detection", "Agent detects 401 error from network tab"],
        ["Phase 1", "Core Testing Agent", "Console error reading", "Agent reads console.error messages"],
        ["Phase 1", "Core Testing Agent", "5-feature test completion", "Agent completes test on sample React app"],
        ["Phase 2", "Code Fix Loop", "Error-to-source mapping", "Agent identifies source file/line of 401 error"],
        ["Phase 2", "Code Fix Loop", "Code fix generation", "Agent generates correct fix for simple auth bug"],
        ["Phase 2", "Code Fix Loop", "Fix-verify retest", "Agent retests after fix and confirms it works"],
        ["Phase 2", "Code Fix Loop", "Beyond-code detection", "Agent detects missing env var as root cause"],
        ["Phase 3", "Landing + Dashboard", "Landing page CTA", "CTA redirects to GitHub OAuth successfully"],
        ["Phase 3", "Landing + Dashboard", "Dashboard test creation", "User creates project and starts test run"],
        ["Phase 3", "Landing + Dashboard", "Live View real-time", "Live View shows real-time browser during test"],
        ["Phase 3", "Landing + Dashboard", "Fix Modal approval", "User approves/rejects fix in Fix Modal"],
        ["Phase 4", "Media + Security", "Broken image detection", "Agent detects 404 image on page"],
        ["Phase 4", "Media + Security", "Audio verification", "Agent verifies audio plays with correct duration"],
        ["Phase 4", "Media + Security", "XSS vulnerability detection", "Agent detects XSS in form field"],
        ["Phase 4", "Media + Security", "Unprotected route detection", "Agent finds unprotected /admin route"],
        ["Phase 5", "Multi-Device", "Dual sandbox coordination", "Orchestrator runs two sandboxes simultaneously"],
        ["Phase 5", "Multi-Device", "Cross-device messaging", "Agent A sends message that Agent B receives"],
        ["Phase 5", "Multi-Device", "Call flow testing", "Agent tests dial, ring, answer flow"],
        ["Phase 5", "Multi-Device", "Stripe test payment", "Agent completes test payment with Stripe test cards"],
        ["Phase 6", "Integration + Polish", "GitHub App PR comments", "Test results posted as PR comments"],
        ["Phase 6", "Integration + Polish", "Admin user management", "Admin views all users and test runs"],
        ["Phase 6", "Integration + Polish", "Plan upgrade flow", "User upgrades from Free to Pro"],
        ["Phase 6", "Integration + Polish", "Self-hosted CLI", "User self-hosts Probato via CLI tool"],
        ["Phase 7", "Launch + Scale", "50 concurrent test runs", "Platform handles 50 concurrent runs"],
        ["Phase 7", "Launch + Scale", "Test run time target", "Average under 30 min for 10-feature app"],
        ["Phase 7", "Launch + Scale", "Launch signups", "500+ signups from Product Hunt launch"],
        ["Phase 7", "Launch + Scale", "LLM cost per run", "LLM cost per test run under $0.50"],
    ]
    col_w_qa = [0.8*inch, 1.2*inch, 1.8*inch, 2.7*inch]
    story.append(make_table(qa_headers, qa_rows, col_w_qa))

    # ─────────────────────────────────────────────────────────────
    # 11. RISK ASSESSMENT
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("11. Risk Assessment"))
    story.append(spacer(6))

    story.append(h2("11.1 Technical Risks"))
    story.append(body(
        "The most significant technical risk is LLM reliability and cost. Probato's agents depend heavily on "
        "LLM outputs for decision-making, code analysis, and fix generation. LLM hallucinations, where the "
        "model generates plausible but incorrect information, could lead to false positive test results, "
        "incorrect fix recommendations, or misdiagnosed root causes. Additionally, LLM API costs scale "
        "linearly with usage, and unexpected cost increases from provider price changes or increased token "
        "consumption could impact the platform's unit economics."
    ))
    story.append(body(
        "Sandbox security is another critical risk. Running untrusted user code in Docker containers, even "
        "with resource limits and network isolation, carries the risk of container escape vulnerabilities. "
        "If a user's repository contains malicious code that exploits a container vulnerability, it could "
        "potentially access other users' data or infrastructure resources. The E2B sandbox alternative "
        "provides stronger isolation guarantees but at higher cost and with less flexibility."
    ))
    story.append(body(
        "Browser automation fragility presents a third technical risk. Playwright-based interactions are "
        "sensitive to timing, rendering differences, and application-specific behaviors that may cause "
        "flaky tests. Slow-loading pages, animated transitions, and dynamic content can all cause the "
        "agent to act before the application is ready, leading to false failures. Mitigating this requires "
        "robust wait strategies, retry mechanisms, and adaptive interaction timing."
    ))

    story.append(h2("11.2 Business Risks"))
    story.append(body(
        "The primary business risk is market adoption. While automated QA testing is a large and growing "
        "market, convincing teams to trust an AI agent with their testing workflow requires overcoming "
        "significant skepticism. Teams that have invested in existing testing frameworks like Cypress, "
        "Playwright, or Selenium may be reluctant to switch, and the autonomous nature of the agent may "
        "raise concerns about control and reliability."
    ))
    story.append(body(
        "Competitive pressure is another business risk. Established testing platforms like BrowserStack, "
        "Sauce Labs, and LambdaTest could add AI capabilities to their existing products, leveraging their "
        "large customer bases and brand recognition. New entrants in the AI testing space could also "
        "emerge, particularly from well-funded startups or large cloud providers looking to expand their "
        "developer tool portfolios."
    ))
    story.append(body(
        "Unit economics represent a third business risk. The cost of LLM API calls, sandbox infrastructure, "
        "and storage must remain below the subscription revenue per user. If LLM costs do not decrease as "
        "expected, or if users consume more resources than anticipated, the platform could operate at a loss. "
        "Careful pricing design and usage-based billing are essential to maintaining healthy margins."
    ))

    story.append(h2("11.3 Mitigation Strategies"))
    story.append(body(
        "To mitigate LLM reliability risks, Probato implements a multi-layered validation approach. All LLM "
        "outputs are cross-referenced with deterministic checks where possible: code fixes are validated by "
        "parsing the AST and running syntax checks, feature discoveries are verified by confirming the "
        "existence of identified routes and components, and diagnostic reports are corroborated with console "
        "and network evidence. The fix-verify loop itself serves as a safety net: if an LLM-generated fix "
        "fails, it is rolled back automatically."
    ))
    story.append(body(
        "Sandbox security is addressed through defense-in-depth. Containers run with minimal privileges, "
        "use seccomp profiles to restrict system calls, and are isolated on separate network segments. "
        "Regular security audits of the container infrastructure, automated vulnerability scanning of base "
        "images, and prompt patching of disclosed vulnerabilities reduce the risk of container escape. The "
        "E2B integration provides an alternative with even stronger isolation for users with strict security "
        "requirements."
    ))
    story.append(body(
        "Market adoption risks are mitigated through a freemium pricing model that lowers the barrier to "
        "entry, a GitHub App integration that embeds Probato into existing developer workflows, and a "
        "focus on demonstrating measurable ROI through case studies and benchmarks. Competitive pressure "
        "is addressed by building deep technical moats: the agent system's sophistication, the fix-verify "
        "loop, and multi-device testing are capabilities that are difficult to replicate quickly. Unit "
        "economics are managed through LLM response caching, prompt optimization to reduce token "
        "consumption, spot instance usage for sandbox infrastructure, and usage-based pricing that scales "
        "costs with revenue."
    ))

    # ─────────────────────────────────────────────────────────────
    # 12. INFRASTRUCTURE COST PROJECTIONS
    # ─────────────────────────────────────────────────────────────
    story.append(spacer(12))
    story.append(h1("12. Infrastructure Cost Projections"))
    story.append(spacer(6))
    story.append(body(
        "The following table presents estimated monthly infrastructure costs at four different scale levels. "
        "These projections are based on current pricing from AWS/GCP, Redis Cloud, and LLM API providers, "
        "and assume an average of 2 test runs per active user per month, with each run consuming approximately "
        "15 minutes of sandbox time and 50,000 LLM tokens. Costs are expected to decrease over time as LLM "
        "API prices trend downward and as caching and optimization reduce per-run resource consumption."
    ))
    story.append(spacer(4))

    cost_headers = ["Cost Category", "100 Users", "1,000 Users", "10,000 Users", "100,000 Users"]
    cost_rows = [
        ["Sandbox Compute (Docker/E2B)", "$50", "$400", "$3,200", "$25,000"],
        ["LLM API Calls (Claude + GPT-4V)", "$200", "$1,800", "$15,000", "$120,000"],
        ["PostgreSQL (Managed)", "$25", "$80", "$400", "$2,500"],
        ["Redis + BullMQ (Managed)", "$15", "$50", "$250", "$1,500"],
        ["S3/R2 Object Storage", "$5", "$30", "$200", "$1,500"],
        ["Vercel Hosting (Frontend)", "$20", "$40", "$150", "$800"],
        ["Monitoring & Logging", "$10", "$40", "$200", "$1,000"],
        ["Network / Bandwidth", "$10", "$60", "$400", "$3,000"],
        ["Total Monthly Cost", "$335", "$2,500", "$19,800", "$155,300"],
        ["Cost Per Active User", "$3.35", "$2.50", "$1.98", "$1.55"],
    ]
    col_w_cost = [2.0*inch, 1.05*inch, 1.05*inch, 1.15*inch, 1.15*inch]
    story.append(make_table(cost_headers, cost_rows, col_w_cost))

    story.append(spacer(12))
    story.append(body(
        "At the 100-user scale, infrastructure costs are modest at $335 per month, making the platform "
        "viable even with a small user base. The dominant cost driver at all scales is LLM API calls, which "
        "account for approximately 60-77% of total infrastructure costs. This underscores the importance of "
        "LLM cost optimization strategies such as response caching, prompt compression, and model selection "
        "based on task complexity (using smaller, cheaper models for simple tasks and reserving large models "
        "for complex analysis)."
    ))
    story.append(body(
        "At the 100,000-user scale, the cost per active user drops to $1.55, well below typical SaaS "
        "subscription prices of $29-$99 per month, providing healthy gross margins of 95-98%. These "
        "projections assume continued decreases in LLM API pricing, which have been observed consistently "
        "over the past two years. If LLM costs remain flat rather than declining, the cost per user at "
        "100,000 users would be approximately $2.00, still providing ample margin for the subscription-based "
        "business model."
    ))

    return story


# ── Main ────────────────────────────────────────────────────────

def main():
    output_dir = Path("/home/z/my-project/download")
    output_dir.mkdir(parents=True, exist_ok=True)
    body_pdf_path = str(output_dir / "Probato_blueprint_body.pdf")

    doc = SimpleDocTemplate(
        body_pdf_path,
        pagesize=A4,
        leftMargin=LEFT_MARGIN,
        rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN,
        bottomMargin=BOTTOM_MARGIN,
        title="Probato Technical Blueprint",
        author="Probato Team",
        subject="Autonomous AI-Powered QA Testing Platform",
    )

    # Add page template with background
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        id='normal'
    )
    template = PageTemplate(id='main', frames=frame, onPage=draw_page_background)
    doc.addPageTemplates([template])

    story = build_content()

    doc.build(story)
    print(f"Body PDF generated: {body_pdf_path}")

    # Generate cover page HTML
    cover_html_path = str(output_dir / "cover.html")
    cover_pdf_path = str(output_dir / "cover.pdf")

    cover_html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  .poster {
    width: 794px;
    min-height: 1123px;
    background: linear-gradient(145deg, #1E1B4B 0%, #2d2869 40%, #7C3AED 100%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: white;
    position: relative;
    overflow: hidden;
    padding: 60px;
  }

  .poster::before {
    content: '';
    position: absolute;
    top: -200px;
    right: -200px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%);
    border-radius: 50%;
  }

  .poster::after {
    content: '';
    position: absolute;
    bottom: -150px;
    left: -150px;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%);
    border-radius: 50%;
  }

  .content {
    position: relative;
    z-index: 1;
    text-align: center;
    width: 100%;
  }

  .logo-mark {
    width: 80px;
    height: 80px;
    border: 3px solid rgba(255,255,255,0.9);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 40px auto;
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -1px;
    background: rgba(255,255,255,0.1);
    backdrop-filter: blur(10px);
  }

  .title {
    font-size: 42px;
    font-weight: 800;
    letter-spacing: -1.5px;
    line-height: 1.15;
    margin-bottom: 20px;
  }

  .subtitle {
    font-size: 18px;
    font-weight: 400;
    color: rgba(255,255,255,0.85);
    letter-spacing: 0.5px;
    margin-bottom: 60px;
  }

  .divider {
    width: 80px;
    height: 3px;
    background: #10B981;
    margin: 0 auto 50px auto;
    border-radius: 2px;
  }

  .meta-row {
    display: flex;
    justify-content: center;
    gap: 60px;
    font-size: 14px;
    color: rgba(255,255,255,0.7);
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .meta-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 6px;
    color: rgba(255,255,255,0.5);
  }

  .meta-value {
    font-size: 16px;
    font-weight: 600;
    color: rgba(255,255,255,0.9);
  }

  .bottom-bar {
    position: absolute;
    bottom: 40px;
    left: 60px;
    right: 60px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: rgba(255,255,255,0.4);
  }

  .tag-line {
    font-size: 13px;
    color: rgba(255,255,255,0.5);
    font-style: italic;
  }
</style>
</head>
<body>
<div class="poster">
  <div class="content">
    <div class="logo-mark">P</div>
    <div class="title">Probato<br>Technical Blueprint</div>
    <div class="subtitle">Autonomous AI-Powered QA Testing Platform</div>
    <div class="divider"></div>
    <div class="meta-row">
      <div class="meta-item">
        <div class="meta-label">Date</div>
        <div class="meta-value">April 2026</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Author</div>
        <div class="meta-value">Probato Team</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Version</div>
        <div class="meta-value">1.0</div>
      </div>
    </div>
  </div>
  <div class="bottom-bar">
    <span>probato.dev</span>
    <span class="tag-line">Clone. Discover. Test. Fix. Ship.</span>
    <span>Confidential</span>
  </div>
</div>
</body>
</html>"""

    with open(cover_html_path, 'w') as f:
        f.write(cover_html)
    print(f"Cover HTML written: {cover_html_path}")

    # Render cover with html2poster.js
    import subprocess
    result = subprocess.run(
        ['node', '/home/z/my-project/skills/pdf/scripts/html2poster.js',
         cover_html_path, '--output', cover_pdf_path, '--width', '794px'],
        capture_output=True, text=True, timeout=60
    )
    print("html2poster stdout:", result.stdout)
    if result.returncode != 0:
        print("html2poster stderr:", result.stderr)
        raise RuntimeError(f"html2poster failed with code {result.returncode}")

    print(f"Cover PDF generated: {cover_pdf_path}")

    # Merge cover and body using pypdf
    from pypdf import PdfReader, PdfWriter

    writer = PdfWriter()

    # Add cover
    cover_reader = PdfReader(cover_pdf_path)
    for page in cover_reader.pages:
        writer.add_page(page)

    # Add body pages
    body_reader = PdfReader(body_pdf_path)
    for page in body_reader.pages:
        writer.add_page(page)

    final_pdf_path = str(output_dir / "Probato_Technical_Blueprint.pdf")
    with open(final_pdf_path, 'wb') as f:
        writer.write(f)

    print(f"Final merged PDF saved: {final_pdf_path}")

    # Clean up temp files
    import os
    for tmp in [cover_pdf_path, body_pdf_path, cover_html_path]:
        if os.path.exists(tmp):
            os.remove(tmp)
            print(f"Cleaned up: {tmp}")

    print("\nPDF generation complete!")


if __name__ == '__main__':
    main()
