// app/lib/gemini.ts
// Gemini Generative Language API (v1beta) wrapper

export interface GeminiMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

export interface GeminiChatResponse {
  candidates: { content: { parts: { text: string }[] } }[];
}

function getApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error("VITE_GEMINI_API_KEY is not set in .env");
  return key;
}

// `gemini-pro` / `gemini-1.5-*` / `gemini-2.0-*` / `gemini-2.5-*` are
// retired or unavailable to new users (404), and the flagship 3.x models
// frequently 503 for Free-Tier keys. The rolling lite alias tracks the
// latest Flash-Lite model, which has the most spare capacity.
// Verified working via ListModels + live generateContent probe.
const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";

function resolveModel(explicit?: string): string {
  const raw = (explicit || import.meta.env.VITE_GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  // Accept "models/gemini-2.5-flash" too — strip the prefix.
  return raw.replace(/^models\//, "");
}

/**
 * POST JSON with a timeout so a stalled request fails visibly
 * instead of leaving the UI on "Analyzing..." forever.
 */
async function postJson(url: string, body: unknown, { timeoutMs = 300_000 } = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Gemini request timed out after ${timeoutMs / 1000}s — please try again.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
function toApiError(status: number, body: string, model: string): Error {
  if (status === 404) {
    return new Error(
      `Gemini API error 404: model "${model}" not found. ` +
        `It is likely retired — set VITE_GEMINI_MODEL to a supported model ` +
        `(e.g. "${DEFAULT_GEMINI_MODEL}") and restart the dev server. Details: ${body}`
    );
  }
  if (status === 429 || status === 503) {
    return new Error(
      `Gemini API error ${status}: model overloaded (temporary) — auto-retried and still busy. ` +
        `Wait a minute and try again. Details: ${body}`
    );
  }
  return new Error(`Gemini API error ${status}: ${body}`);
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Same as postJson but retries transient failures (429/5xx, network blips)
 * with exponential backoff. 4xx (except 429) and timeouts are NOT retried.
 */
async function postJsonWithRetry(
  url: string,
  body: unknown,
  {
    timeoutMs = 300_000,
    maxAttempts = 3,
    onRetry,
  }: { timeoutMs?: number; maxAttempts?: number; onRetry?: (msg: string) => void } = {}
): Promise<Response> {
  const notify = (msg: string) => {
    console.warn(`[gemini] ${msg}`);
    onRetry?.(msg);
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await postJson(url, body, { timeoutMs });
      if (resp.ok || !RETRYABLE_STATUSES.has(resp.status) || attempt === maxAttempts) {
        return resp;
      }
      const waitMs = retryDelayMs(resp, attempt);
      notify(
        `attempt ${attempt}/${maxAttempts}: HTTP ${resp.status}, next try in ${(waitMs / 1000).toFixed(0)}s`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    } catch (err) {
      // Timeouts mean "model too slow", not "try the identical slow thing immediately".
      if ((err instanceof DOMException && err.name === "AbortError") || attempt === maxAttempts) {
        throw err;
      }
      const waitMs = backoffMs(attempt);
      notify(
        `attempt ${attempt}/${maxAttempts}: network error, next try in ${(waitMs / 1000).toFixed(0)}s`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error("Gemini request failed after retries");
}

/** Honor Google's Retry-After header when present, else exponential backoff. */
function retryDelayMs(resp: Response, attempt: number): number {
  const header = resp.headers.get("retry-after");
  const seconds = header ? Number.parseInt(header, 10) : NaN;
  return Number.isFinite(seconds)
    ? Math.min(120_000, seconds * 1000)
    : backoffMs(attempt);
}

function backoffMs(attempt: number): number {
  return Math.min(60_000, 5000 * 2 ** (attempt - 1)) + Math.random() * 1000;
}

function resolveModelChain(primary: string): string[] {
  // Single model by default — fallbacks are opt-in only via
  // VITE_GEMINI_FALLBACK_MODEL="model-a,model-b", so every review
  // is scored by the same model and stays comparable.
  const fallbackEnv: string = String(import.meta.env.VITE_GEMINI_FALLBACK_MODEL || "");
  const raw: string[] = fallbackEnv
    .split(",")
    .map((m) => m.trim().replace(/^models\//, ""))
    .filter((m) => m && m !== primary);
  return [primary, ...new Set(raw)];
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /error (408|429|500|502|503|504)\b|overloaded|UNAVAILABLE|Failed to fetch|NetworkError|timed out/i.test(
    msg
  );
}

/**
 * Analyse a resume image file using Gemini Vision.
 * Converts the image File/Blob to base64 and sends it alongside the instructions.
 */
export async function analyzeResumeWithGemini(
  imageFile: File | Blob,
  instructions: string,
  opts: { onEvent?: (msg: string) => void } = {}
): Promise<string> {
  const apiKey = getApiKey();
  const model = resolveModel();

  // Convert blob to base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:image/...;base64," prefix
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(imageFile);
  });

  const mimeType = imageFile.type || "image/png";

  console.log(
    `[gemini] model=${model} imageKB=${Math.round(imageFile.size / 1024)} ` +
      `promptChars=${instructions.length}`
  );

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: mimeType, data: base64 } },
          { text: instructions },
        ],
      },
    ],
    // Ask for JSON directly (matches our JSON.parse) and cap runaway length.
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
    },
  };

  const run = async (targetModel: string): Promise<string> => {
    const resp = await postJsonWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`,
      body,
      { onRetry: opts.onEvent }
    );
    return parseVisionResponse(resp, targetModel);
  };

  // Walk the model chain (primary + comma-separated fallbacks): a model
  // that keeps failing transiently (429/5xx) yields to the next one.
  const chain = resolveModelChain(model);
  const failures: string[] = [];
  for (const targetModel of chain) {
    if (targetModel !== model) {
      const msg = `model ${model} unavailable, trying ${targetModel}...`;
      console.warn(`[gemini] ${msg}`);
      opts.onEvent?.(msg);
    }
    try {
      return await run(targetModel);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      failures.push(`${targetModel}: ${text}`);
      if (!isTransientError(err)) throw err;
      // else: try next model in chain
    }
  }
  throw new Error(
    `All Gemini models unavailable (${chain.join(", ")}). ` +
      `This is usually Free-Tier throttling during peak demand — try again later or enable billing. ` +
      `Details: ${failures.join(" | ")}`
  );
}

/** Parse a generateContent response; separated so the fallback path can reuse it. */
async function parseVisionResponse(resp: Response, model: string): Promise<string> {
  if (!resp.ok) {
    const err = await resp.text();
    throw toApiError(resp.status, err, model);
  }

  const data: GeminiChatResponse = await resp.json();
  if (!data.candidates?.length) throw new Error("Gemini Vision returned no candidates");

  const text = data.candidates[0].content.parts.map((p) => p.text).join(" ").trim();

  // Strip markdown code fences if present
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}
