// app/lib/atsLocal.ts
// Deterministic, fully local ATS simulation — no network, no LLM.
// Complements the Gemini vision review: keyword matching against the job
// description + resume parsing checks, combined into a 0-100 score.

export interface AtsLocalTip {
    type: "good" | "improve";
    tip: string;
}

export interface AtsParsingCheck {
    label: string;
    passed: boolean;
    detail: string;
}

export interface AtsLocalResult {
    score: number; // 0-100
    keywordCoverage: number; // 0-1 of job keywords found in resume
    matchedKeywords: string[];
    missingKeywords: string[];
    parsingChecks: AtsParsingCheck[];
    tips: AtsLocalTip[];
    resumeWordCount: number;
    resumePageCount: number;
}

const STOPWORDS = new Set([
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with",
    "as", "by", "at", "from", "is", "are", "was", "were", "be", "been",
    "we", "you", "our", "your", "their", "they", "them", "he", "she",
    "it", "its", "this", "that", "these", "those", "will", "would",
    "can", "could", "should", "may", "might", "must", "shall", "do",
    "does", "did", "done", "have", "has", "had", "having", "all",
    "any", "each", "both", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so", "than",
    "too", "very", "just", "also", "about", "into", "through", "during",
    "including", "per", "etc", "eg", "ie", "within", "across", "looking",
    "seeking", "join", "team", "role", "work", "working", "ability",
    "strong", "excellent", "good", "great", "best", "new", "using",
    "use", "used", "day", "year", "years", "opportunity", "candidate",
    "candidates", "individual", "ensure", "help", "including",
]);

const ACTION_VERBS = [
    "led", "built", "managed", "developed", "designed", "created",
    "improved", "increased", "reduced", "delivered", "launched", "owned",
    "drove", "achieved", "architected", "implemented", "optimized",
    "mentored", "spearheaded", "automated",
];

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lowercase alphanumeric-ish tokens, keeping tech tokens like c++, c#, node.js. */
function tokenize(text: string): string[] {
    return (
        text.toLowerCase().match(/[a-z0-9]+(?:[+#]+|\.[a-z0-9]+)*/g) ?? []
    ).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function wordPresent(haystackLower: string, term: string): boolean {
    return new RegExp(`\\b${escapeRegExp(term)}\\b`).test(haystackLower);
}

/** Top-N frequent content tokens from the job description. */
function extractJobKeywords(jobDescription: string, topN = 30): string[] {
    const freq = new Map<string, number>();
    for (const tok of tokenize(jobDescription)) {
        freq.set(tok, (freq.get(tok) ?? 0) + 1);
    }
    return [...freq.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, topN)
        .map(([tok]) => tok);
}

export function analyzeLocalAts(
    resumeText: string,
    opts: { jobTitle: string; jobDescription: string; pageCount: number }
): AtsLocalResult {
    const resumeLower = resumeText.toLowerCase();
    const words = resumeLower.match(/[a-z0-9]+(?:[+#]+|\.[a-z0-9]+)*/g) ?? [];

    // ── Keywords ─────────────────────────────────────────────
    const jd = (opts.jobDescription ?? "").trim();
    const titleTokens = [...new Set(tokenize(opts.jobTitle ?? ""))];
    const keywords = jd.length >= 20 ? extractJobKeywords(jd) : titleTokens;

    const matchedKeywords: string[] = [];
    const missingKeywords: string[] = [];
    for (const kw of keywords) {
        (wordPresent(resumeLower, kw) ? matchedKeywords : missingKeywords).push(kw);
    }
    const keywordCoverage = keywords.length
        ? matchedKeywords.length / keywords.length
        : 0;

    // Job-title relevance (0-1)
    const titleHits = titleTokens.filter((t) => wordPresent(resumeLower, t)).length;
    const titleRelevance = titleTokens.length ? titleHits / titleTokens.length : 0.5;

    // ── Parsing checks ───────────────────────────────────────
    const checks: AtsParsingCheck[] = [];
    const check = (label: string, passed: boolean, detail: string) =>
        checks.push({ label, passed, detail });

    check(
        "Contact email",
        /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(resumeText),
        "A parseable email address was found."
    );
    check(
        "Phone number",
        /\+?\d[\d\s().-]{7,}\d/.test(resumeText),
        "A phone number was found."
    );
    check(
        "LinkedIn / portfolio link",
        /linkedin\.com|github\.com|portfolio|behance\.net/i.test(resumeText),
        "A LinkedIn, GitHub, or portfolio link was found."
    );
    check(
        "Experience section",
        /\b(experience|employment|work history|professional background)\b/i.test(resumeText),
        "An experience section heading was detected."
    );
    check(
        "Education section",
        /\b(education|academic|university|college|degree|bachelor|master|phd)\b/i.test(resumeText),
        "An education section heading was detected."
    );
    check(
        "Skills section",
        /\b(skills|technologies|tech stack|competencies|tools)\b/i.test(resumeText),
        "A skills section heading was detected."
    );
    check(
        "Bullet points",
        /[•▪●▪‣⁃▪]|(^|\n)\s*[-*]\s+\S/.test(resumeText),
        "Bullet-style achievement lines were detected."
    );
    const wordCount = words.length;
    check(
        "Reasonable length",
        wordCount >= 250 && wordCount <= 2500,
        `Resume has ~${wordCount} words (healthy range is ~250-2500).`
    );
    const verbHits = ACTION_VERBS.filter((v) => wordPresent(resumeLower, v)).length;
    check(
        "Action verbs",
        verbHits >= 3,
        `${verbHits} distinct action verb${verbHits === 1 ? "" : "s"} found (led, built, delivered, ...).`
    );

    const scanned = resumeText.replace(/\s+/g, " ").trim().length < 200;
    if (scanned) {
        check(
            "Text extraction",
            false,
            "Almost no selectable text — this PDF looks scanned/image-based and many ATS parsers will reject it."
        );
    }

    // ── Score: 50 keywords + 30 parsing + 20 title ────────────
    const keywordPoints = keywords.length ? keywordCoverage * 50 : 25;
    const parsingPoints =
        (checks.filter((c) => c.passed).length / checks.length) * 30;
    const titlePoints = titleRelevance * 20;
    const score = Math.max(
        0,
        Math.min(100, Math.round(keywordPoints + parsingPoints + titlePoints))
    );

    // ── Tips (ATS schema: { type, tip }) ─────────────────────
    const tips: AtsLocalTip[] = [];
    if (scanned) {
        tips.push({
            type: "improve",
            tip: "PDF has almost no selectable text — export a text-based PDF instead of a scan so ATS parsers can read it.",
        });
    }
    if (missingKeywords.length) {
        tips.push({
            type: "improve",
            tip: `Add missing job keywords: ${missingKeywords.slice(0, 6).join(", ")}${
                missingKeywords.length > 6 ? ` (+${missingKeywords.length - 6} more)` : ""
            }.`,
        });
    } else if (keywords.length) {
        tips.push({
            type: "good",
            tip: `Covers all ${keywords.length} top job keywords — strong match for automated screening.`,
        });
    }
    for (const c of checks) {
        if (!c.passed && c.label !== "Text extraction") {
            tips.push({ type: "improve", tip: `${c.label}: ${improveHint(c.label)}` });
        }
    }
    const goodChecks = checks.filter((c) => c.passed).slice(0, 2);
    for (const c of goodChecks) {
        tips.push({ type: "good", tip: `${c.label} — ${c.detail}` });
    }

    return {
        score,
        keywordCoverage,
        matchedKeywords,
        missingKeywords,
        parsingChecks: checks,
        tips: tips.slice(0, 8),
        resumeWordCount: wordCount,
        resumePageCount: opts.pageCount,
    };
}

function improveHint(label: string): string {
    switch (label) {
        case "Contact email":
            return "add a plain-text email address in the header.";
        case "Phone number":
            return "add a phone number with digits (ATS can't read icons).";
        case "LinkedIn / portfolio link":
            return "add full LinkedIn/GitHub URLs as text, not just icons.";
        case "Experience section":
            return 'add a standard "Experience" heading — creative headings confuse parsers.';
        case "Education section":
            return 'add a standard "Education" heading with degree and school.';
        case "Skills section":
            return 'add a "Skills" section listing tools/technologies as plain text.';
        case "Bullet points":
            return "use simple • or - bullets for achievements; avoid tables/text-boxes.";
        case "Reasonable length":
            return "aim for ~1 page (250-1200 words); trim or expand content.";
        case "Action verbs":
            return "start bullets with action verbs (led, built, delivered) plus metrics.";
        default:
            return "review this section for ATS-friendly plain-text formatting.";
    }
}
