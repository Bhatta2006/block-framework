/**
 * LLM providers behind a single interface.
 *
 * - `RecordedProvider`: deterministic prompt → response pairs from a JSON
 *   file. Used by tests and the benchmark so they run offline with zero
 *   tokens and byte-identical results.
 * - `OpenAICompatibleProvider`: speaks the OpenAI chat-completions API
 *   (`POST {baseUrl}/chat/completions`, Bearer key). Covers OpenAI,
 *   OpenRouter, Groq, DeepSeek, Ollama, and other OpenAI-compatible
 *   endpoints with one thin fetch client — no SDK dependency.
 *
 * The model is chosen by environment, never hardcoded:
 *   BLOCKFW_LLM_PROVIDER  "openai-compatible" | "recorded" (default: recorded)
 *   BLOCKFW_LLM_BASE_URL  e.g. https://api.openai.com/v1
 *   BLOCKFW_LLM_API_KEY   Bearer token (never logged, never stored)
 *   BLOCKFW_LLM_MODEL     e.g. gpt-4o-mini
 *
 * REUSE NOTE (M3 reuse log): evaluated the `openai` npm SDK (Apache-2.0)
 * and `ai` (Vercel AI SDK, Apache-2.0). Rejected both: the chat-completions
 * call we need is ~40 lines of fetch, the SDKs add version-lock and
 * provider-specific surface we don't use, and hand-rolled fetch keeps the
 * provider abstraction (OpenAI-compatible = many vendors) trivially
 * swappable. Structured output is enforced by our own JSON Schema
 * validation (Ajv, already a dependency), not by SDK helpers.
 */
import type { CompletionRequest, CompletionResponse, LlmProvider } from './types.js';

function estimateTokens(text: string): number {
  // Conservative chars/4 estimate, honestly labelled (same as block cards).
  return Math.ceil(text.length / 4);
}

export interface RecordedPair {
  /** Substring that must appear in the user prompt to match. */
  matchUserIncludes: string;
  response: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Deterministic provider for tests and benchmarks. Zero real tokens. */
export class RecordedProvider implements LlmProvider {
  readonly name = 'recorded';
  readonly model: string;
  private pairs: RecordedPair[];

  constructor(pairs: RecordedPair[], model = 'recorded-v1') {
    this.pairs = pairs;
    this.model = model;
  }

  static fromJson(json: string): RecordedProvider {
    const data = JSON.parse(json) as { pairs: RecordedPair[]; model?: string };
    return new RecordedProvider(data.pairs, data.model);
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const hit = this.pairs.find((p) => req.user.includes(p.matchUserIncludes));
    if (!hit) {
      throw new Error(
        `RecordedProvider: no recorded response matches prompt (wanted one of: ${this.pairs
          .map((p) => JSON.stringify(p.matchUserIncludes))
          .join(', ')}). Prompt head: ${req.user.slice(0, 120)}…`,
      );
    }
    return {
      text: hit.response,
      usage: {
        inputTokens: hit.inputTokens ?? estimateTokens(req.system + req.user),
        outputTokens: hit.outputTokens ?? estimateTokens(hit.response),
      },
    };
  }
}

/** Thin fetch client for any OpenAI-compatible chat-completions endpoint. */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible';
  readonly model: string;
  private baseUrl: string;
  private apiKey: string;

  constructor(opts: { baseUrl: string; apiKey: string; model: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.model = opts.model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        max_tokens: req.maxTokens,
        // Ask for JSON; still validated client-side — never trusted blindly.
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('LLM returned empty content');
    return {
      text,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? estimateTokens(req.system + req.user),
        outputTokens: data.usage?.completion_tokens ?? estimateTokens(text),
      },
    };
  }
}

export interface ProviderEnv {
  BLOCKFW_LLM_PROVIDER?: string;
  BLOCKFW_LLM_BASE_URL?: string;
  BLOCKFW_LLM_API_KEY?: string;
  BLOCKFW_LLM_MODEL?: string;
}

/**
 * Build the configured provider from the environment. Defaults to the
 * recorded provider (safe, offline) unless BLOCKFW_LLM_PROVIDER=openai-compatible
 * with a base URL, key, and model all present.
 */
export function providerFromEnv(
  env: ProviderEnv = process.env,
  recorded: RecordedProvider,
): LlmProvider {
  if (
    env.BLOCKFW_LLM_PROVIDER === 'openai-compatible' &&
    env.BLOCKFW_LLM_BASE_URL &&
    env.BLOCKFW_LLM_API_KEY &&
    env.BLOCKFW_LLM_MODEL
  ) {
    return new OpenAICompatibleProvider({
      baseUrl: env.BLOCKFW_LLM_BASE_URL,
      apiKey: env.BLOCKFW_LLM_API_KEY,
      model: env.BLOCKFW_LLM_MODEL,
    });
  }
  return recorded;
}
