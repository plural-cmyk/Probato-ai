#!/usr/bin/env python3
"""Generate Probato Phase 6: Enterprise Intelligence & Production Readiness Plan PDF."""

import os, sys, hashlib, subprocess
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib import colors
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, CondPageBreak, Image
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus import SimpleDocTemplate
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ━━ Font Registration ━━
pdfmetrics.registerFont(TTFont('LiberationSerif', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSerif-Bold', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Carlito', '/usr/share/fonts/truetype/english/Carlito-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Carlito-Bold', '/usr/share/fonts/truetype/english/Carlito-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'))
registerFontFamily('LiberationSerif', normal='LiberationSerif', bold='LiberationSerif-Bold')
registerFontFamily('Carlito', normal='Carlito', bold='Carlito-Bold')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')

# ━━ Cascade Palette ━━
PAGE_BG       = colors.HexColor('#f7f7f6')
SECTION_BG    = colors.HexColor('#f0f0ee')
CARD_BG       = colors.HexColor('#ebeae8')
TABLE_STRIPE  = colors.HexColor('#f0efec')
HEADER_FILL   = colors.HexColor('#57503a')
COVER_BLOCK   = colors.HexColor('#68614e')
BORDER        = colors.HexColor('#c2baa3')
ICON          = colors.HexColor('#776940')
ACCENT        = colors.HexColor('#227490')
ACCENT_2      = colors.HexColor('#58c858')
TEXT_PRIMARY   = colors.HexColor('#22211e')
TEXT_MUTED     = colors.HexColor('#7c7a73')
SEM_SUCCESS   = colors.HexColor('#407752')
SEM_WARNING   = colors.HexColor('#b58f45')
SEM_ERROR     = colors.HexColor('#ac5249')
SEM_INFO      = colors.HexColor('#4e759c')

# ━━ Page Dimensions ━━
PAGE_W, PAGE_H = A4
LEFT_MARGIN = 1.0 * inch
RIGHT_MARGIN = 1.0 * inch
TOP_MARGIN = 0.9 * inch
BOTTOM_MARGIN = 0.9 * inch
AVAILABLE_WIDTH = PAGE_W - LEFT_MARGIN - RIGHT_MARGIN
H1_ORPHAN_THRESHOLD = (PAGE_H - TOP_MARGIN - BOTTOM_MARGIN) * 0.15

# ━━ Styles ━━
styles = getSampleStyleSheet()

cover_title_style = ParagraphStyle(
    'CoverTitle', fontName='LiberationSerif', fontSize=32, leading=40,
    alignment=TA_LEFT, textColor=ACCENT, spaceAfter=12
)
cover_sub_style = ParagraphStyle(
    'CoverSub', fontName='LiberationSerif', fontSize=16, leading=22,
    alignment=TA_LEFT, textColor=TEXT_MUTED, spaceAfter=8
)
toc_title_style = ParagraphStyle(
    'TOCTitle', fontName='LiberationSerif', fontSize=22, leading=28,
    alignment=TA_LEFT, textColor=ACCENT, spaceBefore=0, spaceAfter=18
)
h1_style = ParagraphStyle(
    'H1', fontName='LiberationSerif', fontSize=20, leading=26,
    alignment=TA_LEFT, textColor=ACCENT, spaceBefore=18, spaceAfter=10
)
h2_style = ParagraphStyle(
    'H2', fontName='LiberationSerif', fontSize=15, leading=20,
    alignment=TA_LEFT, textColor=HEADER_FILL, spaceBefore=14, spaceAfter=8
)
h3_style = ParagraphStyle(
    'H3', fontName='LiberationSerif', fontSize=12, leading=16,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=6
)
body_style = ParagraphStyle(
    'Body', fontName='LiberationSerif', fontSize=10.5, leading=17,
    alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=6
)
body_left_style = ParagraphStyle(
    'BodyLeft', fontName='LiberationSerif', fontSize=10.5, leading=17,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=6
)
bullet_style = ParagraphStyle(
    'Bullet', fontName='LiberationSerif', fontSize=10.5, leading=17,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, leftIndent=18, bulletIndent=6,
    spaceBefore=2, spaceAfter=2
)
sub_bullet_style = ParagraphStyle(
    'SubBullet', fontName='LiberationSerif', fontSize=10, leading=15,
    alignment=TA_LEFT, textColor=TEXT_MUTED, leftIndent=36, bulletIndent=22,
    spaceBefore=1, spaceAfter=1
)
callout_style = ParagraphStyle(
    'Callout', fontName='LiberationSerif', fontSize=11, leading=17,
    alignment=TA_LEFT, textColor=ACCENT, leftIndent=24, borderPadding=8,
    spaceBefore=8, spaceAfter=8
)
table_header_style = ParagraphStyle(
    'TableHeader', fontName='LiberationSerif', fontSize=10, leading=14,
    alignment=TA_CENTER, textColor=colors.white
)
table_cell_style = ParagraphStyle(
    'TableCell', fontName='LiberationSerif', fontSize=9.5, leading=13,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY
)
table_cell_center = ParagraphStyle(
    'TableCellCenter', fontName='LiberationSerif', fontSize=9.5, leading=13,
    alignment=TA_CENTER, textColor=TEXT_PRIMARY
)
caption_style = ParagraphStyle(
    'Caption', fontName='LiberationSerif', fontSize=9, leading=13,
    alignment=TA_CENTER, textColor=TEXT_MUTED, spaceBefore=3, spaceAfter=6
)
meta_style = ParagraphStyle(
    'Meta', fontName='LiberationSerif', fontSize=10, leading=15,
    alignment=TA_LEFT, textColor=TEXT_MUTED, spaceBefore=2, spaceAfter=2
)

# ━━ TOC-enabled Doc Template ━━
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/>%s' % (key, text), style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def add_major_section(text, style):
    return [
        CondPageBreak(H1_ORPHAN_THRESHOLD),
        add_heading(text, style, level=0),
    ]

def make_table(headers, rows, col_ratios=None):
    """Create a styled table with palette colors."""
    data = [[Paragraph('<b>%s</b>' % h, table_header_style) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), table_cell_style) for c in row])
    
    if col_ratios:
        col_widths = [r * AVAILABLE_WIDTH for r in col_ratios]
    else:
        col_widths = None
    
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else TABLE_STRIPE
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

def hr_line():
    """Thin horizontal rule as a table."""
    t = Table([['']], colWidths=[AVAILABLE_WIDTH], rowHeights=[1])
    t.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return t

# ━━ Build Story ━━
story = []

# --- TOC ---
story.append(Paragraph('<b>Table of Contents</b>', toc_title_style))
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle(name='TOC1', fontName='LiberationSerif', fontSize=12, leftIndent=20, leading=20, spaceBefore=4, spaceAfter=2, textColor=ACCENT),
    ParagraphStyle(name='TOC2', fontName='LiberationSerif', fontSize=10.5, leftIndent=40, leading=16, spaceBefore=2, spaceAfter=1, textColor=TEXT_PRIMARY),
]
story.append(toc)
story.append(PageBreak())

# =====================================================================
# 1. EXECUTIVE SUMMARY
# =====================================================================
story.extend(add_major_section('1. Executive Summary', h1_style))

story.append(Paragraph(
    'Phase 6 represents the next evolutionary leap for Probato, transitioning the platform from a comprehensive testing tool into an <b>intelligent, self-optimizing quality platform</b> that enterprise teams can rely on for production-grade confidence. After five phases and twenty-eight milestones of foundational construction, Phase 6 introduces the intelligence layer that transforms raw test data into actionable insights, makes tests self-maintaining, extends quality assurance into production monitoring, and delivers the enterprise-grade security and compliance capabilities that large organizations demand.',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'The six milestones in Phase 6 are organized around three strategic pillars. The first pillar, <b>AI Intelligence</b>, encompasses M29 (AI Test Intelligence Engine) and M30 (Self-Healing Tests v2), which together create a feedback loop where the platform learns from every test run, predicts failures before they happen, and automatically repairs broken tests without human intervention. The second pillar, <b>Production Readiness</b>, covers M31 (Synthetic Monitoring and Performance Baselines) and M32 (Enterprise SSO, Audit, and Compliance), bridging the gap between pre-deployment testing and post-deployment monitoring while ensuring the platform meets the security and governance requirements of enterprise customers. The third pillar, <b>Extensibility</b>, includes M33 (Plugin Architecture and Integrations Marketplace) and M34 (Phase 6 Integration and Polish), which open the platform to community-driven innovation and ensure that all Phase 6 features work seamlessly together.',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'By the end of Phase 6, Probato will offer a complete quality intelligence loop: discover features, generate tests, execute them intelligently based on risk and impact analysis, self-heal broken selectors, monitor production health, and provide compliance-ready audit trails. This positions Probato as the definitive platform for teams that need to ship faster with higher confidence, from startups to Fortune 500 enterprises.',
    body_style
))

# =====================================================================
# 2. PHASE 6 OVERVIEW
# =====================================================================
story.extend(add_major_section('2. Phase 6 Overview', h1_style))

story.append(Paragraph(
    'Phase 6 introduces six milestones (M29 through M34) that collectively transform Probato from a reactive testing platform into a proactive quality intelligence system. The phase builds directly on the multi-device orchestration capabilities established in Phase 5, leveraging the existing data models, API infrastructure, and credit-based billing system to add intelligence, production monitoring, enterprise compliance, and extensibility layers.',
    body_style
))

story.append(Spacer(1, 12))
story.append(make_table(
    ['Milestone', 'Name', 'Category', 'Est. Credits'],
    [
        ['M29', 'AI Test Intelligence Engine', 'AI Intelligence', '20 credits/analysis'],
        ['M30', 'Self-Healing Tests v2 and Auto-Maintenance', 'AI Intelligence', '8 credits/repair'],
        ['M31', 'Synthetic Monitoring and Performance Baselines', 'Production Readiness', '3 credits/check'],
        ['M32', 'Enterprise SSO, Audit, and Compliance', 'Production Readiness', 'N/A (plan feature)'],
        ['M33', 'Plugin Architecture and Integrations Marketplace', 'Extensibility', 'Variable per plugin'],
        ['M34', 'Phase 6 Integration and Polish', 'Cross-cutting', 'N/A'],
    ],
    col_ratios=[0.10, 0.35, 0.25, 0.30]
))
story.append(Paragraph('<b>Table 1:</b> Phase 6 Milestone Overview', caption_style))

# =====================================================================
# 3. M29: AI TEST INTELLIGENCE ENGINE
# =====================================================================
story.extend(add_major_section('3. M29: AI Test Intelligence Engine', h1_style))

story.append(Paragraph(
    'The AI Test Intelligence Engine is the brain of Phase 6. It transforms the vast amount of test execution data that Probato already collects into predictive insights and optimization recommendations. Today, teams run tests and review pass/fail results reactively. After M29, Probato will proactively tell teams which tests are most likely to fail, which areas of the application carry the highest risk, and how to optimize test suites for speed and coverage. This milestone introduces three core capabilities: smart test selection, flakiness prediction and classification, and impact-based test prioritization.',
    body_style
))

# --- 3.1 Smart Test Selection ---
story.append(add_heading('3.1 Smart Test Selection', h2_style, level=1))
story.append(Paragraph(
    'Smart Test Selection analyzes code changes and determines which tests are relevant to run, eliminating the wasteful practice of running the entire test suite on every commit. The system works by building a dependency graph between application code and test cases, mapping which source files, functions, and components each test exercises. When a pull request modifies specific files, the intelligence engine traverses the dependency graph to identify the minimal set of tests that could be affected, reducing test execution time by an estimated 60-80% for most pull requests while maintaining equivalent defect detection rates.',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'The dependency graph is constructed from multiple signals. First, the LLM code analysis agent already maps features to source code locations during the discovery phase, providing a baseline mapping. Second, test execution traces capture which API endpoints, DOM selectors, and navigation paths each test touches. Third, runtime coverage data from Puppeteer and Playwright executions records the exact source lines exercised by each test. These signals are fused into a weighted bipartite graph stored in the database, where nodes represent tests and code elements, and edge weights represent the strength of the relationship. When a code change event arrives via the GitHub webhook, the engine performs a graph traversal to compute the affected test set in under 500 milliseconds for typical repositories.',
    body_style
))

story.append(Spacer(1, 6))
story.append(Paragraph('<b>Data Model: TestDependencyGraph</b>', callout_style))
story.append(Paragraph(
    'A new Prisma model <b>TestDependencyGraph</b> stores the bidirectional mapping between tests and code elements. Each record links a TestCase to a source file path, function name, or component identifier, with a confidence score (0.0-1.0) and a last-verified timestamp. The model also captures the dependency type (import, call, render, navigate, or API call) to enable fine-grained impact analysis. A companion model, <b>SmartSelectionResult</b>, logs each selection decision, recording which tests were selected, the triggering code change, the selection rationale, and the actual outcomes (pass/fail/skip) for continuous learning and graph refinement.',
    body_style
))

# --- 3.2 Flakiness Prediction ---
story.append(add_heading('3.2 Flakiness Prediction and Classification', h2_style, level=1))
story.append(Paragraph(
    'Flaky tests, those that produce inconsistent results without any code changes, are the single largest source of wasted engineering time in quality assurance. Industry surveys consistently report that 30-50% of engineering teams spend more than 10 hours per week dealing with flaky tests. M29 tackles this problem with a machine learning-based flakiness predictor that classifies each test case into one of four categories: stable (consistently passes), flaky (inconsistent results), failing (consistently fails), and unknown (insufficient data). The classifier uses a rich feature set extracted from historical test runs, including pass rate variance, execution time variance, time-of-day patterns, concurrent execution correlation, and dependency change frequency.',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'The flakiness classifier operates in two modes: batch analysis and real-time detection. Batch analysis runs nightly, re-evaluating every test case against its full historical run data and updating the flakiness score. Real-time detection monitors test execution streams and raises alerts when a previously stable test shows early warning signs of flakiness, such as increasing execution time variance or a cluster of intermittent failures within a short window. The existing FeatureRiskScore model is extended with flakiness-specific fields, including a numeric flakiness score (0-100), a classification label, the primary flakiness indicator (timing, order-dependency, resource-contention, or external-dependency), and a recommended quarantine action.',
    body_style
))

story.append(Spacer(1, 6))
story.append(Paragraph('<b>Data Model: FlakinessReport</b>', callout_style))
story.append(Paragraph(
    'The <b>FlakinessReport</b> model stores the per-test flakiness classification, computed by the batch analysis job. Fields include the test case ID, flakiness score (0-100), classification label (stable, flaky, failing, unknown), primary indicator, confidence level, last 10 run outcomes as a JSON array, and the timestamp of the last analysis. A separate <b>FlakinessAlert</b> model captures real-time flakiness detection events, linking to the test run that triggered the alert and the specific anomaly detected.',
    body_style
))

# --- 3.3 Impact-Based Test Prioritization ---
story.append(add_heading('3.3 Impact-Based Test Prioritization', h2_style, level=1))
story.append(Paragraph(
    'When teams must run a subset of tests due to time constraints, the order in which tests execute matters significantly. Impact-based test prioritization ranks tests so that those most likely to reveal faults run first, maximizing the probability of catching defects early in the test cycle. The prioritization engine uses three signals: code change impact (from the dependency graph), historical failure correlation (tests that have previously failed alongside the changed code), and business criticality (user-defined priority levels for features and test suites). The result is a priority score for each test that determines its execution order.',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'The prioritization engine integrates with the existing test execution pipeline. When a test run is initiated, the engine queries the dependency graph to find affected tests, applies the flakiness classifier to adjust weights (flaky tests are deprioritized unless explicitly included), incorporates business criticality metadata from the project configuration, and produces an ordered test execution plan. This plan is passed to the test executor agent, which runs tests in the specified priority order. Early termination is supported: if a critical test fails, the system can immediately notify the team rather than completing the entire suite. The impact analysis results are stored in a new <b>ImpactAnalysisResult</b> model, providing a full audit trail of prioritization decisions.',
    body_style
))

# M29 API Routes
story.append(add_heading('3.4 API Routes', h2_style, level=1))
story.append(make_table(
    ['Route', 'Methods', 'Description'],
    [
        ['/api/intelligence/dependencies', 'GET / POST', 'Query or rebuild test-code dependency graph'],
        ['/api/intelligence/dependencies/[id]', 'GET', 'Get dependency details for a specific test'],
        ['/api/intelligence/select', 'POST', 'Smart test selection based on code changes'],
        ['/api/intelligence/flakiness', 'GET', 'List flakiness reports across all projects'],
        ['/api/intelligence/flakiness/[id]', 'GET / PATCH', 'Get or update a specific flakiness report'],
        ['/api/intelligence/flakiness/analyze', 'POST', 'Trigger batch flakiness analysis job'],
        ['/api/intelligence/flakiness/alerts', 'GET', 'List real-time flakiness alerts'],
        ['/api/intelligence/prioritize', 'POST', 'Generate prioritized test execution plan'],
        ['/api/intelligence/impact', 'GET', 'List impact analysis results'],
        ['/api/intelligence/impact/[id]', 'GET', 'Get specific impact analysis result'],
    ],
    col_ratios=[0.42, 0.18, 0.40]
))
story.append(Paragraph('<b>Table 2:</b> M29 API Routes', caption_style))

# M29 Credit Actions
story.append(add_heading('3.5 Credit Actions', h2_style, level=1))
story.append(make_table(
    ['Action', 'Credits', 'Description'],
    [
        ['smart_selection', '5', 'Run smart test selection for a code change'],
        ['flakiness_analysis', '10', 'Run batch flakiness analysis on a project'],
        ['impact_analysis', '20', 'Run full impact analysis with prioritization'],
        ['dependency_rebuild', '3', 'Rebuild dependency graph from execution traces'],
    ],
    col_ratios=[0.30, 0.15, 0.55]
))
story.append(Paragraph('<b>Table 3:</b> M29 Credit Actions', caption_style))

# =====================================================================
# 4. M30: SELF-HEALING TESTS V2
# =====================================================================
story.extend(add_major_section('4. M30: Self-Healing Tests v2 and Auto-Maintenance', h1_style))

story.append(Paragraph(
    'Phase 1 introduced the auto-heal feature, which suggests fixes when tests fail during execution. M30 dramatically expands this capability into a comprehensive self-healing and auto-maintenance system that proactively repairs tests before they fail, detects deprecating patterns, and keeps test suites healthy without manual intervention. The key evolution from the existing auto-heal is the shift from reactive (fix after failure) to proactive (predict and prevent), and from single-step fixes to multi-step repair chains that can handle complex breakages such as page structure changes, API contract modifications, and authentication flow updates.',
    body_style
))

# --- 4.1 Selector Self-Healing ---
story.append(add_heading('4.1 Selector Self-Healing', h2_style, level=1))
story.append(Paragraph(
    'The most common cause of test failure is selector breakage: a CSS selector, XPath expression, or data-testid that no longer matches the page DOM after a UI change. Selector self-healing addresses this by maintaining multiple candidate selectors for each test step and automatically falling back to alternatives when the primary selector fails. When a test step references a selector that cannot be found, the healing engine opens the page in the sandbox browser, analyzes the current DOM structure, and uses a combination of visual similarity (comparing the expected element screenshot with the current page), structural similarity (matching by tag name, attributes, and sibling relationships), and LLM-assisted semantic matching (understanding the intent of the test step and finding the element that best fulfills it) to locate the correct element.',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'When a new selector is found, the system generates a repair candidate with a confidence score, applies it to the test step, re-executes the test from that point, and if the test passes, persists the repair as a new primary selector while demoting the old selector to a fallback. The entire process is logged in a <b>SelectorRepair</b> model that captures the old selector, new selector, confidence score, DOM snapshot before and after, and the test run that verified the repair. This model extends the existing FixSuggestion model with selector-specific metadata, enabling teams to review and approve automatic repairs or revert them if they introduce false positives.',
    body_style
))

# --- 4.2 Test Code Auto-Maintenance ---
story.append(add_heading('4.2 Test Code Auto-Maintenance', h2_style, level=1))
story.append(Paragraph(
    'Beyond selector repairs, M30 introduces comprehensive test code auto-maintenance that handles a broader range of test degradation patterns. The system continuously monitors test suites for four categories of maintenance needs: deprecation warnings (APIs, libraries, or browser features that the test depends on are being phased out), assertion drift (expected values that diverge from actual application behavior due to legitimate feature changes), step sequence staleness (multi-step flows that no longer match the current application navigation), and test code quality issues (duplicate test cases, overly complex assertions, or unused test utilities).',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'The auto-maintenance engine runs as a periodic analysis job that scans all test cases in a project, cross-references them with recent application changes and deprecation notices from the LLM analysis agent, and generates maintenance recommendations. Each recommendation includes a severity level (critical, warning, or info), a suggested code change (as a unified diff), an explanation of why the change is needed, and an estimated effort score. Critical recommendations, such as tests that will break due to a known upcoming API deprecation, are automatically promoted to notifications and can optionally trigger automatic repair if the confidence score exceeds a configurable threshold. All maintenance records are stored in a <b>TestMaintenanceRecord</b> model, providing a complete history of test health over time.',
    body_style
))

# --- 4.3 Deprecation Detection ---
story.append(add_heading('4.3 Deprecation and Breaking Change Detection', h2_style, level=1))
story.append(Paragraph(
    'A unique capability of the self-healing system is its ability to detect upcoming deprecations and breaking changes before they cause test failures. The system integrates with GitHub webhook events to monitor for deprecation notices in pull request descriptions, release notes, and changelog files. When a deprecation is detected that affects a test case (determined by the dependency graph from M29), the system generates a proactive maintenance recommendation with a timeline, suggesting that the test be updated before the deprecation becomes effective. For breaking changes that have already been deployed, the system correlates test failures with the code change that caused them and generates a targeted repair suggestion. This forward-looking capability transforms test maintenance from a reactive firefight into a planned, predictable process.',
    body_style
))

# M30 API Routes
story.append(add_heading('4.4 API Routes', h2_style, level=1))
story.append(make_table(
    ['Route', 'Methods', 'Description'],
    [
        ['/api/self-heal/selector-repairs', 'GET / POST', 'List or create selector repair records'],
        ['/api/self-heal/selector-repairs/[id]', 'GET / PATCH', 'Get or approve/reject a repair'],
        ['/api/self-heal/maintenance', 'GET', 'List all maintenance recommendations'],
        ['/api/self-heal/maintenance/[id]', 'GET / PATCH', 'Get or action a maintenance record'],
        ['/api/self-heal/maintenance/scan', 'POST', 'Trigger maintenance scan for a project'],
        ['/api/self-heal/deprecations', 'GET', 'List detected deprecations affecting tests'],
        ['/api/self-heal/deprecations/[id]', 'GET', 'Get deprecation details and affected tests'],
        ['/api/self-heal/auto-repair', 'POST', 'Execute automatic repair with confidence threshold'],
    ],
    col_ratios=[0.42, 0.18, 0.40]
))
story.append(Paragraph('<b>Table 4:</b> M30 API Routes', caption_style))

# =====================================================================
# 5. M31: SYNTHETIC MONITORING
# =====================================================================
story.extend(add_major_section('5. M31: Synthetic Monitoring and Performance Baselines', h1_style))

story.append(Paragraph(
    'Testing before deployment is necessary but not sufficient. Many defects only manifest in production: performance regressions under real load, third-party service failures, CDN configuration errors, and DNS resolution problems. M31 extends Probato into production monitoring by introducing synthetic monitoring checkpoints that continuously verify application health from the user perspective, and performance baselines that detect regressions before they impact users. This milestone bridges the pre-deployment and post-deployment quality gap, completing the quality feedback loop.',
    body_style
))

# --- 5.1 Synthetic Monitoring Checkpoints ---
story.append(add_heading('5.1 Synthetic Monitoring Checkpoints', h2_style, level=1))
story.append(Paragraph(
    'Synthetic monitoring checkpoints are scheduled, automated browser interactions that run against production URLs at regular intervals to verify that critical user flows remain functional. Unlike the existing Schedule model which runs Playwright test cases on the staging or development environment, synthetic checkpoints execute simplified versions of key user journeys against live production endpoints, measuring not just pass/fail outcomes but also response times, error rates, and content validity. Each checkpoint is defined by a URL, a sequence of interaction steps (navigate, click, type, wait, assert), an expected outcome (status code, content match, visual match), and a schedule (interval in minutes, with a minimum of 5 minutes to respect rate limits and credit budgets).',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'When a checkpoint fails, the system generates an alert through the existing notification infrastructure, including the specific step that failed, a screenshot of the page at the point of failure, the response time compared to the baseline, and a correlation with recent deployments (from GitHub webhook events). Checkpoints can be configured with different severity levels: critical checkpoints (e.g., login flow, checkout process) trigger immediate alerts to all configured channels, while informational checkpoints (e.g., about page loads, search functionality) generate lower-priority notifications. The <b>SyntheticCheckpoint</b> model stores the checkpoint definition, and a companion <b>CheckpointResult</b> model records each execution outcome with full telemetry data.',
    body_style
))

# --- 5.2 Performance Baselines ---
story.append(add_heading('5.2 Performance Baselines and Web Vitals', h2_style, level=1))
story.append(Paragraph(
    'Performance baselines establish the expected performance characteristics for each synthetic checkpoint and track deviations over time. The system integrates with Lighthouse CI to capture Core Web Vitals metrics (Largest Contentful Paint, First Input Delay, Cumulative Layout Shift) and custom performance metrics (Time to First Byte, DOM Content Loaded, full page load) for each checkpoint execution. Baseline values are computed using a rolling window of the last 30 successful executions, with configurable thresholds for regression detection (default: 20% degradation from baseline triggers a warning, 50% triggers a critical alert).',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'The performance baseline system introduces two new models. The <b>PerformanceBaseline</b> model stores the computed baseline values for each metric associated with a synthetic checkpoint, including the mean, standard deviation, 50th percentile, 75th percentile, and 95th percentile over the rolling window. The <b>PerformanceRegression</b> model records detected regressions, capturing the metric name, baseline value, observed value, deviation percentage, and the checkpoint execution that triggered the detection. Regressions are automatically correlated with deployment events to identify the code change that likely caused the regression, leveraging the dependency graph from M29 to narrow the search scope.',
    body_style
))

# --- 5.3 Integration with Existing Systems ---
story.append(add_heading('5.3 Integration with Existing Systems', h2_style, level=1))
story.append(Paragraph(
    'Synthetic monitoring integrates deeply with Probato\'s existing infrastructure. Checkpoint results feed into the flakiness prediction engine from M29, helping distinguish between genuine production issues and monitoring noise. Performance regressions trigger the self-healing system from M30 when the regression is caused by a selector or assertion change rather than a genuine performance issue. Notification dispatch uses the existing NotificationChannel infrastructure, adding two new event types: checkpoint_failure and performance_regression. Billing integration uses the credit system, with each checkpoint execution consuming credits based on the number of steps and the monitoring interval. The scheduler engine is extended to support high-frequency intervals (down to 5 minutes) for synthetic checkpoints, separate from the existing test schedule system which runs at daily or hourly intervals.',
    body_style
))

# M31 API Routes
story.append(add_heading('5.4 API Routes', h2_style, level=1))
story.append(make_table(
    ['Route', 'Methods', 'Description'],
    [
        ['/api/monitoring/checkpoints', 'GET / POST', 'List or create synthetic checkpoints'],
        ['/api/monitoring/checkpoints/[id]', 'GET / PATCH / DELETE', 'Manage a specific checkpoint'],
        ['/api/monitoring/checkpoints/[id]/results', 'GET', 'Get execution results for a checkpoint'],
        ['/api/monitoring/baselines', 'GET', 'List performance baselines'],
        ['/api/monitoring/baselines/[id]', 'GET / PATCH', 'View or adjust baseline thresholds'],
        ['/api/monitoring/regressions', 'GET', 'List detected performance regressions'],
        ['/api/monitoring/regressions/[id]', 'GET', 'Get regression details and correlation'],
        ['/api/monitoring/dashboard', 'GET', 'Aggregated monitoring dashboard data'],
    ],
    col_ratios=[0.45, 0.22, 0.33]
))
story.append(Paragraph('<b>Table 5:</b> M31 API Routes', caption_style))

# =====================================================================
# 6. M32: ENTERPRISE SSO, AUDIT & COMPLIANCE
# =====================================================================
story.extend(add_major_section('6. M32: Enterprise SSO, Audit, and Compliance', h1_style))

story.append(Paragraph(
    'Enterprise adoption requires more than just features; it demands governance, security, and compliance capabilities that allow organizations to trust the platform with their code, test data, and internal workflows. M32 delivers the three critical enterprise requirements: Single Sign-On (SSO) integration via SAML and OpenID Connect, comprehensive audit logging for regulatory compliance, and role-based access control enhancements that support the complex permission structures of large organizations. These capabilities are essential for Probato to penetrate the enterprise market segment, which represents the highest revenue potential for the platform.',
    body_style
))

# --- 6.1 SSO Integration ---
story.append(add_heading('6.1 Single Sign-On Integration (SAML and OIDC)', h2_style, level=1))
story.append(Paragraph(
    'The SSO integration enables organizations to manage Probato access through their existing identity providers, including Okta, Azure Active Directory, Google Workspace, and OneLogin. The implementation supports both SAML 2.0 and OpenID Connect (OIDC) protocols, with SAML as the primary protocol for enterprise customers and OIDC as a lighter-weight alternative for organizations that prefer OAuth 2.0-based authentication. The SSO flow is implemented as a NextAuth.js custom provider that delegates authentication to the configured identity provider, receives the authentication response, and maps identity provider groups and roles to Probato team roles and permissions.',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'The SSO configuration is managed at the team level, allowing each team to configure its own identity provider connection. The <b>SSOConfiguration</b> model stores the protocol type (SAML or OIDC), the identity provider metadata (entity ID, SSO URL, certificate for SAML; client ID, issuer URL, discovery URL for OIDC), the group-to-role mapping rules, and the domain restrictions (which email domains are allowed to authenticate via this SSO configuration). When a user authenticates via SSO, the system automatically creates or updates their Probato account, assigns them to the appropriate team based on their identity provider groups, and applies the corresponding role permissions. This eliminates the need for manual user provisioning and ensures that access changes in the identity provider are immediately reflected in Probato.',
    body_style
))

# --- 6.2 Audit Logging ---
story.append(add_heading('6.2 Comprehensive Audit Logging', h2_style, level=1))
story.append(Paragraph(
    'Audit logging provides a tamper-evident record of all significant actions performed on the platform, enabling organizations to meet regulatory requirements such as SOC 2 Type II, GDPR, HIPAA, and ISO 27001. The audit log captures who performed each action, what the action was, when it occurred, from where (IP address and user agent), and what resources were affected. Every API endpoint that modifies data is instrumented to emit audit log entries, including test execution, project creation and deletion, team membership changes, billing modifications, SSO configuration updates, and API key operations.',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'The <b>AuditLog</b> model stores each audit entry with an immutable hash chain that links consecutive entries, making it possible to detect any tampering with the log. Each entry includes the actor (user ID or system service), action type (create, read, update, delete, execute), resource type and ID, before and after snapshots (for update actions), the IP address, user agent, and a SHA-256 hash of the previous entry. A companion <b>AuditLogExport</b> model supports scheduled exports of audit logs to external SIEM systems (Splunk, Datadog, AWS CloudTrail) via webhook delivery, enabling integration with existing enterprise security monitoring infrastructure. The audit log retention policy is configurable per team, with a default of 90 days and options for 180 days, 1 year, or indefinite retention for regulated industries.',
    body_style
))

# --- 6.3 RBAC v2 ---
story.append(add_heading('6.3 Role-Based Access Control v2', h2_style, level=1))
story.append(Paragraph(
    'The existing team role system (owner, admin, member, viewer) is extended with granular permissions that enable fine-grained access control at the project, feature, and test level. The enhanced RBAC system introduces four concepts: permission policies (named sets of permissions that can be assigned to roles), resource scopes (which resources a permission applies to), permission conditions (contextual rules such as time-of-day restrictions or IP allow-lists), and delegated administration (allowing non-owner users to manage specific resources). The system ships with five predefined permission policies matching the existing role structure, plus the ability to create custom policies for organizations with unique compliance requirements.',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'The implementation extends the existing TeamMember model with a <b>PermissionPolicy</b> reference and a JSON field for custom permission overrides. A new <b>ResourcePermission</b> model captures project-level and test-level permission grants that override the team-level policy. The permission evaluation engine is implemented as middleware that intercepts API requests, resolves the user\'s effective permissions by merging their team policy with any resource-specific overrides, and checks whether the requested action is permitted. All permission evaluations are logged to the audit system, providing complete visibility into access decisions. This architecture supports the principle of least privilege while maintaining the simplicity of the current role system for teams that do not need granular permissions.',
    body_style
))

# M32 API Routes
story.append(add_heading('6.4 API Routes', h2_style, level=1))
story.append(make_table(
    ['Route', 'Methods', 'Description'],
    [
        ['/api/sso/config', 'GET / POST', 'Get or create SSO configuration for a team'],
        ['/api/sso/config/[id]', 'GET / PATCH / DELETE', 'Manage SSO configuration'],
        ['/api/sso/metadata', 'GET', 'Get SP metadata for IdP configuration'],
        ['/api/sso/callback', 'POST', 'SSO authentication callback endpoint'],
        ['/api/audit/logs', 'GET', 'Query audit log entries with filters'],
        ['/api/audit/logs/[id]', 'GET', 'Get specific audit log entry'],
        ['/api/audit/exports', 'GET / POST', 'List or create audit log export configurations'],
        ['/api/audit/exports/[id]', 'GET / PATCH / DELETE', 'Manage export configuration'],
        ['/api/audit/verify', 'POST', 'Verify audit log hash chain integrity'],
        ['/api/permissions/policies', 'GET / POST', 'List or create permission policies'],
        ['/api/permissions/policies/[id]', 'GET / PATCH / DELETE', 'Manage a permission policy'],
        ['/api/permissions/check', 'POST', 'Check if a user has a specific permission'],
    ],
    col_ratios=[0.40, 0.25, 0.35]
))
story.append(Paragraph('<b>Table 6:</b> M32 API Routes', caption_style))

# =====================================================================
# 7. M33: PLUGIN ARCHITECTURE
# =====================================================================
story.extend(add_major_section('7. M33: Plugin Architecture and Integrations Marketplace', h1_style))

story.append(Paragraph(
    'No platform can anticipate every testing need. M33 opens Probato to community and third-party innovation by introducing a plugin architecture that allows developers to extend the platform with custom test types, result processors, notification channels, and data source integrations. The plugin system is designed with security as a primary concern: plugins run in sandboxed execution contexts, have explicitly declared permissions, and are subject to code review before publication in the integrations marketplace. This milestone transforms Probato from a closed platform into an extensible ecosystem, enabling rapid innovation without compromising platform stability or security.',
    body_style
))

# --- 7.1 Plugin SDK ---
story.append(add_heading('7.1 Plugin SDK and Runtime', h2_style, level=1))
story.append(Paragraph(
    'The Plugin SDK provides a TypeScript API for developing Probato plugins. Plugins are packaged as npm modules with a specific manifest file (probato-plugin.json) that declares the plugin\'s name, version, description, permissions, and extension points. The SDK defines five extension point types: test executors (custom test runners that implement the ITestExecutor interface), result processors (post-processing hooks that analyze test results and generate insights), notification channels (new delivery methods for alerts), data sources (integrations with external tools such as Jira, Linear, or PagerDuty), and UI panels (custom dashboard components rendered in the Probato UI via a secure iframe sandbox).',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'The plugin runtime manages the lifecycle of installed plugins, including installation, activation, configuration, execution, and deactivation. Plugins are executed in isolated V8 isolates (using Node.js worker threads) with resource limits (CPU time, memory, and network access) enforced by the runtime. The runtime also provides a messaging API that allows plugins to communicate with the core platform through well-defined interfaces, preventing direct database access and ensuring that all plugin operations are logged and auditable. The <b>Plugin</b> model stores the plugin manifest, installation status, configuration schema, and the team that installed it. The <b>PluginExecution</b> model records each plugin invocation with input parameters, output results, resource consumption metrics, and any errors encountered.',
    body_style
))

# --- 7.2 Integrations Marketplace ---
story.append(add_heading('7.2 Integrations Marketplace', h2_style, level=1))
story.append(Paragraph(
    'The Integrations Marketplace is a curated directory of verified plugins that teams can browse, install, and configure directly from the Probato dashboard. The marketplace supports three tiers of plugins: official plugins (built and maintained by the Probato team, such as Jira integration, Slack advanced notifications, and Datadog metrics export), verified plugins (built by third parties and reviewed by the Probato team for security and quality), and community plugins (published by any developer without formal review, available with an explicit warning). Each marketplace listing includes a description, screenshots, permission requirements, installation count, average rating, and a link to the source code repository.',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'The marketplace is implemented as a new section in the Probato dashboard, with API endpoints for browsing, searching, installing, and rating plugins. Plugin installation is a two-step process: first, the team admin reviews the plugin permissions and approves the installation; second, the plugin runtime downloads the plugin package, validates its integrity (using SHA-256 checksums and digital signatures), and registers it with the platform. Installed plugins appear in a dedicated management panel where administrators can configure settings, view execution logs, and deactivate or uninstall plugins. The marketplace UI also supports private plugins, which are hosted on the team\'s own infrastructure and not visible to other teams, enabling organizations to build internal integrations without publishing them publicly.',
    body_style
))

# M33 API Routes
story.append(add_heading('7.3 API Routes', h2_style, level=1))
story.append(make_table(
    ['Route', 'Methods', 'Description'],
    [
        ['/api/plugins', 'GET / POST', 'List installed plugins or upload a new plugin'],
        ['/api/plugins/[id]', 'GET / PATCH / DELETE', 'Manage a specific plugin'],
        ['/api/plugins/[id]/configure', 'POST', 'Update plugin configuration'],
        ['/api/plugins/[id]/activate', 'POST', 'Activate an installed plugin'],
        ['/api/plugins/[id]/deactivate', 'POST', 'Deactivate a plugin'],
        ['/api/plugins/[id]/executions', 'GET', 'List plugin execution history'],
        ['/api/marketplace', 'GET', 'Browse marketplace listings'],
        ['/api/marketplace/[id]', 'GET', 'Get marketplace listing details'],
        ['/api/marketplace/[id]/install', 'POST', 'Install a marketplace plugin'],
        ['/api/marketplace/[id]/reviews', 'GET / POST', 'List or submit plugin reviews'],
    ],
    col_ratios=[0.42, 0.22, 0.36]
))
story.append(Paragraph('<b>Table 7:</b> M33 API Routes', caption_style))

# =====================================================================
# 8. M34: PHASE 6 INTEGRATION & POLISH
# =====================================================================
story.extend(add_major_section('8. M34: Phase 6 Integration and Polish', h1_style))

story.append(Paragraph(
    'The final milestone of Phase 6 focuses on cross-feature integration, SDK updates, documentation, performance optimization, and quality assurance. While each milestone delivers standalone value, the true power of Phase 6 emerges when the intelligence engine, self-healing system, synthetic monitoring, enterprise features, and plugin architecture work together as a unified platform. M34 ensures that these capabilities are deeply integrated, well-documented, performant, and thoroughly tested before the phase is declared complete.',
    body_style
))

# --- 8.1 Cross-Feature Integration ---
story.append(add_heading('8.1 Cross-Feature Integration Workstreams', h2_style, level=1))
story.append(Paragraph(
    'The integration workstreams connect the Phase 6 features into coherent end-to-end workflows. The first workstream, <b>Intelligence-to-Action Loop</b>, connects M29 and M30 so that flakiness predictions automatically trigger self-healing actions, and impact analysis results inform selector repair prioritization. When the intelligence engine identifies a flaky test, it not only classifies the flakiness but also suggests the most likely cause (e.g., a selector that depends on dynamic content), and the self-healing engine uses this hint to generate more targeted repair candidates. The second workstream, <b>Test-to-Monitor Pipeline</b>, connects M29 and M31 by allowing teams to promote any test case to a synthetic monitoring checkpoint with a single click, automatically configuring the checkpoint schedule, step sequence, and expected outcomes from the test definition. The third workstream, <b>Compliance-to-Audit Trail</b>, ensures that all Phase 6 actions (intelligence queries, self-healing repairs, monitoring alerts, plugin executions) generate audit log entries, providing a complete compliance picture.',
    body_style
))

# --- 8.2 SDK Updates ---
story.append(add_heading('8.2 SDK and API Documentation Updates', h2_style, level=1))
story.append(Paragraph(
    'The Probato SDK is extended with four new resource classes corresponding to the Phase 6 features. The <b>Intelligence</b> resource provides methods for smart test selection, flakiness analysis, and impact prioritization. The <b>SelfHeal</b> resource exposes selector repair and maintenance scan operations. The <b>Monitoring</b> resource covers synthetic checkpoint management and performance baseline queries. The <b>Plugins</b> resource enables programmatic plugin installation and configuration. Each resource follows the existing SDK pattern of HTTP client methods with TypeScript type definitions, error handling, and rate limit awareness. The OpenAPI specification is updated with all new endpoints, and the interactive API documentation at /api/v1/docs is regenerated to include Phase 6 endpoints with request/response examples.',
    body_style
))

# --- 8.3 Performance and Quality ---
story.append(add_heading('8.3 Performance Optimization and Quality Assurance', h2_style, level=1))
story.append(Paragraph(
    'Phase 6 introduces several computationally intensive operations (dependency graph traversal, flakiness analysis, selector healing DOM analysis, plugin sandboxing) that require careful performance optimization. M34 includes a dedicated performance audit that benchmarks all new API endpoints against target response times: dependency graph queries under 500ms, flakiness analysis under 30 seconds for a typical project, selector healing under 10 seconds per repair, and synthetic checkpoint execution under 60 seconds. Database query optimization includes adding indexes for the new models, materialized views for frequently queried aggregations (such as flakiness scores and performance baselines), and connection pooling configuration for high-concurrency monitoring workloads. The test suite is expanded with integration tests that exercise the cross-feature workflows, edge case tests for the plugin sandbox, and load tests for the synthetic monitoring system. Target: 700+ total tests passing across all phases.',
    body_style
))

# =====================================================================
# 9. DATA MODEL SUMMARY
# =====================================================================
story.extend(add_major_section('9. Data Model Summary', h1_style))

story.append(Paragraph(
    'Phase 6 introduces 12 new Prisma models that extend the existing 42-model schema. These models are designed to integrate with the existing User, Project, TestCase, TestRun, and Team models through foreign key relationships, maintaining referential integrity and enabling efficient cross-feature queries. The following table summarizes all new models with their primary purpose and the milestone that introduces them.',
    body_style
))
story.append(Spacer(1, 8))
story.append(make_table(
    ['Model', 'Milestone', 'Purpose'],
    [
        ['TestDependencyGraph', 'M29', 'Bidirectional mapping between tests and code elements'],
        ['SmartSelectionResult', 'M29', 'Log of smart test selection decisions'],
        ['FlakinessReport', 'M29', 'Per-test flakiness classification and scores'],
        ['FlakinessAlert', 'M29', 'Real-time flakiness detection events'],
        ['ImpactAnalysisResult', 'M29', 'Impact analysis and prioritization records'],
        ['SelectorRepair', 'M30', 'Selector self-healing repair records'],
        ['TestMaintenanceRecord', 'M30', 'Test code maintenance recommendations'],
        ['SyntheticCheckpoint', 'M31', 'Synthetic monitoring checkpoint definitions'],
        ['CheckpointResult', 'M31', 'Checkpoint execution outcomes and telemetry'],
        ['PerformanceBaseline', 'M31', 'Computed performance metric baselines'],
        ['PerformanceRegression', 'M31', 'Detected performance regression events'],
        ['SSOConfiguration', 'M32', 'SAML/OIDC identity provider configurations'],
        ['AuditLog', 'M32', 'Tamper-evident audit log entries'],
        ['AuditLogExport', 'M32', 'Scheduled audit log export configurations'],
        ['PermissionPolicy', 'M32', 'Granular permission policy definitions'],
        ['ResourcePermission', 'M32', 'Resource-level permission overrides'],
        ['Plugin', 'M33', 'Installed plugin manifest and configuration'],
        ['PluginExecution', 'M33', 'Plugin invocation history and metrics'],
        ['MarketplaceListing', 'M33', 'Marketplace plugin directory entries'],
    ],
    col_ratios=[0.28, 0.12, 0.60]
))
story.append(Paragraph('<b>Table 8:</b> Phase 6 New Data Models', caption_style))

# =====================================================================
# 10. IMPLEMENTATION TIMELINE
# =====================================================================
story.extend(add_major_section('10. Implementation Timeline and Dependencies', h1_style))

story.append(Paragraph(
    'Phase 6 milestones have carefully managed dependencies. M29 (AI Test Intelligence Engine) must be completed before M30 (Self-Healing Tests v2) because the self-healing system uses dependency graph data and flakiness predictions to generate more accurate repairs. M31 (Synthetic Monitoring) depends on M29 for checkpoint promotion from test cases and for correlating monitoring results with deployment events. M32 (Enterprise SSO and Audit) is independent of M29-M31 and can be developed in parallel. M33 (Plugin Architecture) depends on M32 for the permission model that governs plugin access. M34 (Integration and Polish) depends on all preceding milestones. The following timeline assumes sequential development with M32 developed in parallel with M29-M31.',
    body_style
))
story.append(Spacer(1, 8))
story.append(make_table(
    ['Milestone', 'Depends On', 'Estimated Duration', 'Parallel Track'],
    [
        ['M29: AI Test Intelligence', 'Phase 5 complete', '2-3 weeks', 'Track A'],
        ['M30: Self-Healing v2', 'M29', '2-3 weeks', 'Track A'],
        ['M31: Synthetic Monitoring', 'M29', '2-3 weeks', 'Track A'],
        ['M32: Enterprise SSO/Audit', 'Phase 5 complete', '2-3 weeks', 'Track B'],
        ['M33: Plugin Architecture', 'M32', '2-3 weeks', 'Track B'],
        ['M34: Integration and Polish', 'M29-M33', '1-2 weeks', 'Final'],
    ],
    col_ratios=[0.28, 0.20, 0.25, 0.27]
))
story.append(Paragraph('<b>Table 9:</b> Phase 6 Implementation Timeline', caption_style))

# =====================================================================
# 11. CREDIT AND BILLING IMPACT
# =====================================================================
story.extend(add_major_section('11. Credit and Billing Impact', h1_style))

story.append(Paragraph(
    'Phase 6 introduces several new credit-consuming actions that expand the existing billing model. The credit costs are calibrated to be proportional to the computational resources consumed and the business value delivered. Intelligence and analysis operations (M29) are priced higher than simple test executions because they involve LLM calls and graph computations. Self-healing repairs (M30) are priced comparably to the existing auto-heal action. Synthetic monitoring (M31) uses a per-check credit model that accounts for both the browser execution time and the monitoring frequency. Enterprise features (M32) and the plugin marketplace (M33) are plan-level features rather than credit-consuming actions, incentivizing upgrades to Team and Enterprise plans.',
    body_style
))
story.append(Spacer(1, 8))
story.append(make_table(
    ['Action', 'Credits', 'Plan Availability'],
    [
        ['smart_selection', '5', 'Pro, Team, Enterprise'],
        ['flakiness_analysis', '10', 'Pro, Team, Enterprise'],
        ['impact_analysis', '20', 'Team, Enterprise'],
        ['dependency_rebuild', '3', 'Pro, Team, Enterprise'],
        ['selector_repair', '8', 'Pro, Team, Enterprise'],
        ['maintenance_scan', '6', 'Pro, Team, Enterprise'],
        ['synthetic_checkpoint', '3', 'Team, Enterprise'],
        ['performance_baseline', '2', 'Team, Enterprise'],
        ['sso_authentication', 'N/A', 'Enterprise plan feature'],
        ['audit_log_access', 'N/A', 'Team, Enterprise plan feature'],
        ['plugin_install', 'Variable', 'All plans (marketplace-dependent)'],
    ],
    col_ratios=[0.30, 0.20, 0.50]
))
story.append(Paragraph('<b>Table 10:</b> Phase 6 Credit Actions and Plan Availability', caption_style))

story.append(Spacer(1, 12))
story.append(Paragraph(
    'The plan tier restrictions for Phase 6 features are designed to drive upgrades while maintaining accessibility for individual developers. Smart test selection and flakiness analysis are available on the Pro plan, ensuring that individual professionals and small teams can benefit from AI intelligence. Impact analysis, synthetic monitoring, and performance baselines require the Team plan, reflecting the collaborative and production-facing nature of these features. SSO and advanced audit logging are Enterprise-only features, consistent with the typical enterprise pricing model. Plugin installation is available on all plans, but some marketplace plugins may have their own plan requirements or separate pricing.',
    body_style
))

# =====================================================================
# 12. RISKS AND MITIGATIONS
# =====================================================================
story.extend(add_major_section('12. Risks and Mitigations', h1_style))

story.append(Paragraph(
    'Phase 6 introduces several technical and business risks that must be proactively managed. The following analysis identifies the most significant risks and proposes concrete mitigation strategies for each.',
    body_style
))
story.append(Spacer(1, 8))
story.append(make_table(
    ['Risk', 'Severity', 'Mitigation'],
    [
        ['Dependency graph accuracy', 'High', 'Continuous learning from selection outcomes; fallback to full suite when confidence < 80%'],
        ['Self-healing false positives', 'High', 'Confidence thresholds; human approval for critical tests; repair revert capability'],
        ['Synthetic monitoring cost', 'Medium', 'Credit budgets per checkpoint; frequency caps; efficient headless execution'],
        ['Plugin sandbox escape', 'Critical', 'V8 isolate sandboxing; resource limits; security review for verified plugins'],
        ['SSO integration complexity', 'Medium', 'Support top 3 IdPs first (Okta, Azure AD, Google); community templates for others'],
        ['Audit log performance', 'Medium', 'Async log writing; batch exports; time-based partitioning for large volumes'],
        ['Flakiness classifier accuracy', 'Medium', 'Retrain on false positive feedback; ensemble methods; human override labels'],
    ],
    col_ratios=[0.22, 0.12, 0.66]
))
story.append(Paragraph('<b>Table 11:</b> Phase 6 Risk Assessment', caption_style))

story.append(Spacer(1, 12))
story.append(Paragraph(
    'The most critical risk is plugin sandbox escape, which could allow a malicious plugin to access sensitive data or execute arbitrary code on the server. This risk is mitigated by a defense-in-depth strategy: plugins run in isolated V8 contexts with no direct access to the filesystem, network, or database; all plugin operations go through the platform API which enforces permission checks; verified plugins undergo manual code review; and the plugin runtime enforces strict resource limits (CPU time, memory, and network requests). Additionally, the audit log captures all plugin operations, enabling rapid detection and investigation of any suspicious activity. If a sandbox escape vulnerability is discovered, the plugin can be immediately deactivated across all installations through the marketplace infrastructure.',
    body_style
))

# =====================================================================
# BUILD DOCUMENT
# =====================================================================
output_dir = '/home/z/my-project/download'
body_path = os.path.join(output_dir, 'phase6_body.pdf')
final_path = os.path.join(output_dir, 'Probato_Phase6_Plan.pdf')

doc = TocDocTemplate(
    body_path,
    pagesize=A4,
    leftMargin=LEFT_MARGIN,
    rightMargin=RIGHT_MARGIN,
    topMargin=TOP_MARGIN,
    bottomMargin=BOTTOM_MARGIN,
    title='Probato Phase 6: Enterprise Intelligence and Production Readiness',
    author='Z.ai',
    creator='Z.ai',
)
doc.multiBuild(story)

# ━━ Generate Cover ━━
cover_html = os.path.join(output_dir, 'phase6_cover.html')
cover_pdf = os.path.join(output_dir, 'phase6_cover.pdf')

W_PX = 794  # A4 at 96dpi
H_PX = 1123

with open(cover_html, 'w') as f:
    f.write(f'''<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&family=Source+Serif+4:wght@400;700&display=swap" rel="stylesheet">
<style>
@page {{ size: {W_PX}px {H_PX}px; margin: 0; }}
html, body {{ margin: 0; padding: 0; width: {W_PX}px; height: {H_PX}px; background: #f7f7f6; font-family: 'Inter', sans-serif; overflow: hidden; }}
.cover-bg {{ position: absolute; inset: 0; z-index: 1; overflow: hidden; }}
.cover-lines {{ position: absolute; inset: 0; z-index: 2; }}
.cover-text {{ position: absolute; inset: 0; z-index: 3; }}
.grid-bg {{
    position: absolute; inset: 0;
    background-image:
        linear-gradient(rgba(34,116,144,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(34,116,144,0.04) 1px, transparent 1px);
    background-size: 50px 50px;
}}
.thick-line {{
    position: absolute;
    left: 9.5%; top: 10%; width: 6px; height: 80%;
    background: #227490;
}}
.meta-line {{
    position: absolute;
    left: 12%; top: 72%; width: 35%; height: 1px;
    background: rgba(34,116,144,0.3);
}}
.kicker {{
    position: absolute;
    left: 12%; top: 15%;
    font-size: 13px; font-weight: 400;
    letter-spacing: 3px; color: rgba(34,33,30,0.5);
    text-transform: uppercase;
}}
.hero-title {{
    position: absolute;
    left: 12%; top: 28%;
    font-family: 'Source Serif 4', serif;
    font-size: 48px; font-weight: 800;
    color: #227490; line-height: 1.15;
    max-width: 65%;
}}
.summary {{
    position: absolute;
    left: 12%; top: 50%;
    font-size: 15px; font-weight: 400;
    color: rgba(34,33,30,0.75); line-height: 1.6;
    max-width: 55%;
}}
.meta {{
    position: absolute;
    left: 12%; top: 75%;
    font-size: 14px; font-weight: 400;
    color: rgba(124,122,115,1); line-height: 2.0;
}}
</style>
</head>
<body>
<div class="cover-bg">
    <div class="grid-bg"></div>
</div>
<div class="cover-lines">
    <div class="thick-line"></div>
    <div class="meta-line"></div>
</div>
<div class="cover-text">
    <div class="kicker">PHASE 6 PLANNING DOCUMENT</div>
    <div class="hero-title">Enterprise<br>Intelligence<br>and Production<br>Readiness</div>
    <div class="summary">Six milestones (M29-M34) that transform Probato from a comprehensive testing platform into an intelligent, self-optimizing quality system with production monitoring, enterprise compliance, and extensible plugin architecture.</div>
    <div class="meta">Probato AI Testing Platform<br>Milestones 29-34<br>May 2026</div>
</div>
</body>
</html>''')

# Render cover
scripts_dir = os.path.expanduser('~/my-project/skills/pdf/scripts')
subprocess.run([
    'node', os.path.join(scripts_dir, 'html2poster.js'),
    cover_html, '--output', cover_pdf, '--width', f'{W_PX}px'
], check=True)

# ━━ Merge Cover + Body ━━
from pypdf import PdfReader, PdfWriter, Transformation

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - 595.28) > 2 or abs(h - 841.89) > 2:
        sx, sy = 595.28 / w, 841.89 / h
        page.add_transformation(Transformation().scale(sx=sx, sy=sy))
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (595.28, 841.89)
    return page

writer = PdfWriter()
cover_page = PdfReader(cover_pdf).pages[0]
writer.add_page(normalize_page_to_a4(cover_page))
for page in PdfReader(body_path).pages:
    writer.add_page(normalize_page_to_a4(page))

writer.add_metadata({
    '/Title': 'Probato Phase 6: Enterprise Intelligence and Production Readiness',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Phase 6 planning document for the Probato AI-powered autonomous testing platform',
})
with open(final_path, 'wb') as f:
    writer.write(f)

# Cleanup
os.remove(cover_html)
os.remove(cover_pdf)
os.remove(body_path)

print(f'Phase 6 plan PDF generated: {final_path}')
