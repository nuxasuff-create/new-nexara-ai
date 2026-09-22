
import express from "express";
import dotenv from "dotenv";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

dotenv.config({ override: true });

// Dedicated Groq configuration with rotational key pool for ultra-fast text/chat/writing tasks
export const USER_GROQ_KEY_1 = "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";
export const USER_GROQ_KEY_2 = "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";

const RAW_GROQ_KEYS = [
  USER_GROQ_KEY_1,
  USER_GROQ_KEY_2,
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2
];

export const GROQ_API_KEYS = Array.from(
  new Set(
    RAW_GROQ_KEYS.filter((k): k is string => typeof k === 'string' && k.trim().startsWith("gsk_"))
  )
);

let currentGroqKeyIndex = 0;

export function getActiveGroqKey(customKey?: string): string {
  if (customKey && customKey.startsWith("gsk_")) {
    return customKey;
  }
  if (GROQ_API_KEYS.length === 0) return "";
  return GROQ_API_KEYS[currentGroqKeyIndex % GROQ_API_KEYS.length];
}

export function rotateToNextGroqKey(): string {
  if (GROQ_API_KEYS.length <= 1) {
    return getActiveGroqKey();
  }
  const prevIndex = currentGroqKeyIndex;
  currentGroqKeyIndex = (currentGroqKeyIndex + 1) % GROQ_API_KEYS.length;
  console.log(
    `[Groq Key Pool Failover] Groq Key #${prevIndex + 1} experienced an issue. Auto-switching to Groq Key #${currentGroqKeyIndex + 1}...`
  );
  return GROQ_API_KEYS[currentGroqKeyIndex];
}

const GROQ_API_KEY = GROQ_API_KEYS[0] || "";
let groqClient: Groq | null = null;

function getGroqClient(customKey?: string): Groq | null {
  const keyToUse = getActiveGroqKey(customKey);
  if (!keyToUse) return null;
  if (!customKey && groqClient) return groqClient;
  const client = new Groq({ apiKey: keyToUse });
  if (!customKey) groqClient = client;
  return client;
}

// -------------------------------------------------------------------------
// Gemini Key Pool - Exclusively the 2 specified keys with automatic failover rotation
// As requested: gemini api key oi 2 tai hoba
// Key 1: AQ.Ab8RN6JwucOkP7Dev1kQB87wCm81DJtDMW0uBbjHRo9HUd-21g
// Key 2: AQ.Ab8RN6K-ONOac8RMJip7C_MZgvrJBoHGYHdMEZdWQO-NvFxRMw
// -------------------------------------------------------------------------
export const USER_GEMINI_KEY_1 = "AQ.Ab8RN6JwucOkP7Dev1kQB87wCm81DJtDMW0uBbjHRo9HUd-21g";
export const USER_GEMINI_KEY_2 = "AQ.Ab8RN6K-ONOac8RMJip7C_MZgvrJBoHGYHdMEZdWQO-NvFxRMw";

// The Gemini key pool consists exclusively of these 2 keys
export const GEMINI_API_KEYS: string[] = [
  USER_GEMINI_KEY_1,
  USER_GEMINI_KEY_2
];

let currentGeminiKeyIndex = 0;

export function getActiveGeminiKey(customKey?: string): string {
  if (customKey && (customKey.startsWith("AQ.") || customKey.startsWith("AIza"))) {
    return customKey;
  }
  if (GEMINI_API_KEYS.length === 0) return "";
  return GEMINI_API_KEYS[currentGeminiKeyIndex % GEMINI_API_KEYS.length];
}

export function rotateToNextGeminiKey(): string {
  if (GEMINI_API_KEYS.length <= 1) {
    return getActiveGeminiKey();
  }
  const prevIndex = currentGeminiKeyIndex;
  currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % GEMINI_API_KEYS.length;
  console.log(
    `[Gemini Key Pool Failover] Gemini Key #${prevIndex + 1} experienced an issue. Auto-switching to Gemini Key #${currentGeminiKeyIndex + 1}...`
  );
  return GEMINI_API_KEYS[currentGeminiKeyIndex];
}

const RAW_BACKEND_KEYS = [
  process.env.VITE_OPENROUTER_API_KEY_1 || process.env.VITE_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
  process.env.VITE_OPENROUTER_API_KEY_2,
  process.env.VITE_OPENROUTER_API_KEY_3,
  process.env.VITE_OPENROUTER_API_KEY_4
];

// Filter out empty or unconfigured strings so only valid active keys are stored in pool
const OPENROUTER_API_KEYS = RAW_BACKEND_KEYS.filter(
  (key): key is string => typeof key === 'string' && key.trim().length > 0
);

let currentKeyIndex = 0;

function getActiveKey(customKey?: string): string {
  if (customKey && customKey.startsWith("sk-or-")) {
    return customKey;
  }
  if (OPENROUTER_API_KEYS.length === 0) return "";
  return OPENROUTER_API_KEYS[currentKeyIndex % OPENROUTER_API_KEYS.length];
}

function rotateToNextKey(): string {
  if (OPENROUTER_API_KEYS.length <= 1) {
    return getActiveKey();
  }
  const prevIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % OPENROUTER_API_KEYS.length;
  console.log(
    `[Nexara Failover Engine] Key #${prevIndex + 1} exhausted. Auto-switching to Key #${currentKeyIndex + 1}...`
  );
  return OPENROUTER_API_KEYS[currentKeyIndex];
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const OPENROUTER_FREE_MODELS = [
  "openrouter/free",
  "deepseek/deepseek-r1:free",
  "deepseek/deepseek-r1-distill-llama-70b:free",
  "google/gemini-2.0-flash-lite-preview-02-05:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "qwen/qwen-2.5-coder-32b-instruct:free",
  "mistralai/mistral-small-24b-instruct-2501:free"
];

export function parseApiError(err: any): string {
  if (!err) return "An unknown error occurred.";

  if (typeof err === "string") {
    const trimmed = err.trim();
    if (trimmed === "[object Object]") return "An unexpected API error occurred.";
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseApiError(parsed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  if (typeof err === "object") {
    if (err.error) {
      return parseApiError(err.error);
    }
    if (typeof err.message === "string" && err.message && err.message !== "[object Object]") {
      return err.message;
    }
    if (typeof err.message === "object" && err.message) {
      return parseApiError(err.message);
    }
    if (typeof err.detail === "string") {
      return err.detail;
    }
    if (typeof err.msg === "string") {
      return err.msg;
    }
    try {
      const str = JSON.stringify(err);
      if (str && str !== "{}" && str !== "[object Object]") {
        return str;
      }
    } catch {
      // Fallback
    }
  }

  const fallback = String(err);
  return fallback !== "[object Object]" ? fallback : "An unexpected API error occurred.";
}

function shouldTriggerWebSearch(userQuery: string, explicitSearchSetting?: boolean): boolean {
  if (explicitSearchSetting === true) return true;
  if (explicitSearchSetting === false) return false;
  if (!userQuery || typeof userQuery !== "string") return false;

  const text = userQuery.trim().toLowerCase();
  if (!text) return false;

  // If user provided an explicit URL link in message, enable search/web content processing
  if (/(https?:\/\/[^\s]+)/.test(text)) {
    return true;
  }

  // Common casual greetings and general identity questions - STRICTLY DO NOT trigger web search
  const casualGreetingRegex = /^(hi|hello|hey|hy|hola|sup|yo|greetings|good\s*(morning|afternoon|evening|night)|how\s*are\s*you|how\s*r\s*u|how\s*is\s*it\s*going|whats\s*up|what's\s*up|who\s*are\s*you|what\s*is\s*your\s*name|who\s*made\s*you|who\s*created\s*you|who\s*built\s*you|কেমন\s*আছো|কেমন\s*আছেন|হাই|হ্যালো|হেই|নমস্কার|সালাম|আসসালামু\s*আলাইকুম|assalamu\s*alaikum|তুমি\s*কে|তোমার\s*নাম\s*কি|তোমাকে\s*কে\s*বানিয়েছে|তোমার\s*ডেভেলপার\s*কে|শুভ\s*(সকাল|সন্ধ্যা|রাত্রি))[!?.\s]*$/i;
  
  if (casualGreetingRegex.test(text)) {
    return false;
  }

  // Explicit real-time / live search and grounding keywords
  const realtimeKeywords = [
    "search", "search the web", "search online", "google", "look up online", "browse the web", "find online", "grounding",
    "latest news", "current news", "today news", "today's news", "breaking news", "recent news", "news today", "news",
    "stock price", "crypto price", "live price", "current price", "btc price", "eth price", "share market", "price of",
    "weather today", "current weather", "weather forecast", "temperature today", "weather in",
    "live score", "match score", "score today", "who won today", "who won", "game score", "match result",
    "latest version", "release date", "recent update", "what happened today", "today's events", "what happened",
    "who is the current", "what is the latest", "who is the president", "who is the prime minister", "who is the ceo",
    "upcoming", "today", "yesterday", "tomorrow", "recent", "currently", "right now",
    "2024", "2025", "2026", "2027",
    "খবর", "আজকের খবর", "সর্বশেষ খবর", "সর্বশেষ", "আজকের", "লাইভ দাম", "শেয়ার বাজার", "আজকের আবহাওয়া", "আজকের খেলা", "লাইভ স্কোর", "বর্তমান", "কে জিতেছে", "নতুন আপডেট"
  ];

  const hasRealtimeKeyword = realtimeKeywords.some(keyword => text.includes(keyword));
  if (hasRealtimeKeyword) {
    return true;
  }

  return false;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface GroundingResult {
  text: string;
  sources: GroundingSource[];
  searchQueries: string[];
}

// Dedicated Search Grounding execution using Gemini key pool with googleSearch tool
export async function callGeminiSearchGrounding(
  messages: any[],
  temperature: number = 0.7,
  onChunk?: (chunk: string) => void,
  onStatus?: (status: string, tool?: string) => void,
  onGrounding?: (metadata: { sources: GroundingSource[]; searchQueries: string[] }) => void
): Promise<GroundingResult> {
  const poolSize = GEMINI_API_KEYS.length;
  if (poolSize === 0) {
    throw new Error("No Gemini API keys are configured in the key pool.");
  }

  const systemMessage = messages.find((m: any) => m.role === "system")?.content || "";
  let chatMessages = messages
    .filter((m: any) => m.role !== "system")
    .map((m: any) => {
      const role = m.role === "assistant" ? "model" : "user";
      let parts: any[] = [];
      if (Array.isArray(m.content)) {
        parts = m.content.map((c: any) => {
          if (c.type === "text") return { text: c.text };
          if (c.type === "image_url" && typeof c.image_url?.url === "string") {
            const match = c.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
          }
          return { text: "" };
        });
      } else {
        parts = [{ text: typeof m.content === "string" ? m.content : "" }];
      }
      return { role, parts };
    });

  if (chatMessages.length === 0) {
    chatMessages = [{ role: "user", parts: [{ text: "Hello" }] }];
  } else if (chatMessages[0].role === "model") {
    chatMessages.unshift({ role: "user", parts: [{ text: "Continue" }] });
  }

  const config: any = {
    temperature,
    tools: [{ googleSearch: {} }]
  };
  if (systemMessage) {
    config.systemInstruction = systemMessage;
  }

  if (onStatus) {
    onStatus("Searching the web with Google Search...", "web_search");
  }

  let lastError: any = null;

  for (let attempt = 0; attempt < poolSize; attempt++) {
    const activeKey = getActiveGeminiKey();
    if (!activeKey) {
      rotateToNextGeminiKey();
      continue;
    }

    const ai = new GoogleGenAI({
      apiKey: activeKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const collectedSources: GroundingSource[] = [];
    const collectedQueries: string[] = [];
    const seenUris = new Set<string>();

    const extractGrounding = (candidate: any) => {
      const meta = candidate?.groundingMetadata;
      if (!meta) return;

      if (Array.isArray(meta.webSearchQueries)) {
        for (const q of meta.webSearchQueries) {
          if (typeof q === "string" && !collectedQueries.includes(q)) {
            collectedQueries.push(q);
          }
        }
      }

      if (Array.isArray(meta.groundingChunks)) {
        for (const chunk of meta.groundingChunks) {
          const uri = chunk.web?.uri || chunk.maps?.uri;
          const title = chunk.web?.title || chunk.maps?.title || "Web Source";
          if (uri && !seenUris.has(uri)) {
            seenUris.add(uri);
            collectedSources.push({ title, uri });
          }
        }
      }

      if (onGrounding && (collectedSources.length > 0 || collectedQueries.length > 0)) {
        onGrounding({
          sources: [...collectedSources],
          searchQueries: [...collectedQueries]
        });
      }
    };

    for (const model of ["gemini-3.6-flash", "gemini-3.5-flash"]) {
      try {
        if (onChunk) {
          const responseStream = await ai.models.generateContentStream({
            model,
            contents: chatMessages,
            config
          });

          let accumulatedText = "";
          let emittedLength = 0;

          for await (const chunk of responseStream) {
            if (chunk.candidates?.[0]) {
              extractGrounding(chunk.candidates[0]);
            }
            if (chunk.text) {
              accumulatedText += chunk.text;
              const sanitizedSoFar = sanitizeResponseText(accumulatedText);
              if (sanitizedSoFar.length > emittedLength) {
                const chunkToEmit = sanitizedSoFar.slice(emittedLength);
                emittedLength = sanitizedSoFar.length;
                onChunk(chunkToEmit);
              }
            }
          }

          return {
            text: sanitizeResponseText(accumulatedText),
            sources: collectedSources,
            searchQueries: collectedQueries
          };
        } else {
          const response = await ai.models.generateContent({
            model,
            contents: chatMessages,
            config
          });

          if (response.candidates?.[0]) {
            extractGrounding(response.candidates[0]);
          }

          return {
            text: sanitizeResponseText(response.text || ""),
            sources: collectedSources,
            searchQueries: collectedQueries
          };
        }
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        console.warn(`[Gemini Search Grounding Pool] Key #${currentGeminiKeyIndex + 1} with model ${model} failed:`, msg);
        if (
          msg.includes("403") ||
          msg.includes("PERMISSION_DENIED") ||
          msg.includes("429") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("quota")
        ) {
          break;
        }
      }
    }

    rotateToNextGeminiKey();
  }

  throw lastError || new Error("All Gemini search grounding keys in pool exhausted.");
}

/**
 * Executes chat, reasoning, writing, or image analysis tasks using the Gemini Key Pool (1-6).
 * Follows the architecture diagram:
 * - Image request -> Gemini key pool (1-6) (Rotates on failure)
 * - Text request -> Falls back to Gemini key pool on Groq error/rate limit (Rotates on failure)
 */
export async function callGeminiChatWithPool(
  messages: any[],
  temperature: number = 0.7,
  customKey?: string,
  onChunk?: (chunk: string) => void,
  onStatus?: (status: string, tool?: string) => void,
  enableWebSearch: boolean = false
): Promise<string> {
  const poolSize = GEMINI_API_KEYS.length;
  const hasCustomKey = !!(customKey && (customKey.startsWith("AQ.") || customKey.startsWith("AIza")));
  const totalAttempts = hasCustomKey ? poolSize + 1 : poolSize;

  if (poolSize === 0 && !hasCustomKey) {
    throw new Error("No Gemini API keys available in the key pool.");
  }

  const systemMessage = messages.find((m: any) => m.role === "system")?.content || "";
  let chatMessages = messages
    .filter((m: any) => m.role !== "system")
    .map((m: any) => {
      const role = m.role === "assistant" ? "model" : "user";
      let parts: any[] = [];
      if (Array.isArray(m.content)) {
        parts = m.content.map((c: any) => {
          if (c.type === "text") return { text: c.text };
          if (c.type === "image_url" && typeof c.image_url?.url === "string") {
            const match = c.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
          }
          return { text: "" };
        });
      } else {
        parts = [{ text: typeof m.content === "string" ? m.content : "" }];
      }
      return { role, parts };
    });

  if (chatMessages.length === 0) {
    chatMessages = [{ role: "user", parts: [{ text: "Hello" }] }];
  } else if (chatMessages[0].role === "model") {
    chatMessages.unshift({ role: "user", parts: [{ text: "Continue" }] });
  }

  const config: any = {
    temperature: temperature !== undefined ? temperature : 0.7
  };
  if (systemMessage) {
    config.systemInstruction = systemMessage;
  }
  if (enableWebSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  const modelsToTry = ["gemini-3.6-flash", "gemini-3.5-flash"];
  let lastError: any = null;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    let activeKey: string;
    let keyLabel: string;

    if (attempt === 0 && hasCustomKey) {
      activeKey = customKey!;
      keyLabel = "User Custom Gemini Key";
    } else {
      activeKey = getActiveGeminiKey();
      keyLabel = `Gemini Pool Key #${currentGeminiKeyIndex + 1}`;
    }

    if (!activeKey) {
      rotateToNextGeminiKey();
      continue;
    }

    const ai = new GoogleGenAI({
      apiKey: activeKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    for (const model of modelsToTry) {
      try {
        console.log(`[Gemini Key Pool | ${keyLabel}] Executing model: ${model}`);
        if (onStatus) {
          onStatus("Nexara AI is thinking (Gemini)...", "thinking");
        }

        if (onChunk) {
          const responseStream = await ai.models.generateContentStream({
            model,
            contents: chatMessages,
            config
          });

          let accumulatedText = "";
          let emittedLength = 0;

          for await (const chunk of responseStream) {
            if (chunk.text) {
              accumulatedText += chunk.text;
              const sanitizedSoFar = sanitizeResponseText(accumulatedText);
              if (sanitizedSoFar.length > emittedLength) {
                const chunkToEmit = sanitizedSoFar.slice(emittedLength);
                emittedLength = sanitizedSoFar.length;
                onChunk(chunkToEmit);
              }
            }
          }
          return sanitizeResponseText(accumulatedText);
        } else {
          const response = await ai.models.generateContent({
            model,
            contents: chatMessages,
            config
          });
          return sanitizeResponseText(response.text || "");
        }
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        console.warn(`[Gemini Key Pool | ${keyLabel}] Model ${model} failed:`, msg);
        if (
          msg.includes("403") ||
          msg.includes("PERMISSION_DENIED") ||
          msg.includes("429") ||
          msg.includes("RESOURCE_EXHAUSTED") ||
          msg.includes("quota") ||
          msg.includes("denied access") ||
          msg.includes("API key not valid")
        ) {
          break;
        }
      }
    }

    rotateToNextGeminiKey();
  }

  throw lastError || new Error("All Gemini API keys in rotational pool failed.");
}

function sanitizeResponseText(text: string): string {
  if (!text) return "";
  let sanitized = text;
  sanitized = sanitized.replace(/<think>[\s\S]*?<\/think>/gi, '');
  sanitized = sanitized.replace(/<think>[\s\S]*$/gi, '');
  // Cleanly strip out all variation of safety headers/preambles (e.g. "User Safety:", "User Safety: safe", "Safety Rating:", etc.)
  sanitized = sanitized.replace(/(?:User|Response|Prompt|System|Input|Output)?\s*Safety(?:\s*Rating)?\s*:\s*[^\n]*/gi, '');
  sanitized = sanitized.replace(/^:\s*OPENROUTER PROCESSING\s*/gim, '');
  sanitized = sanitized.replace(/^System Instructions:\s*/gim, '');
  sanitized = sanitized.replace(/^System:\s*/gim, '');
  return sanitized.replace(/^\s+/, '').trim();
}

/**
 * Executes high-speed text writing & conversational completions using Groq.
 * EXCLUSIVELY used for text/writing/chat tasks — NOT used for photo analysis/vision.
 */
async function callGroqTextChat(
  messages: any[],
  temperature: number = 0.7,
  customKey?: string,
  onChunk?: (chunk: string) => void,
  onStatus?: (status: string, tool?: string) => void
): Promise<string> {
  const keysToTry: string[] = [];
  if (customKey && customKey.startsWith("gsk_")) {
    keysToTry.push(customKey);
  }
  if (GROQ_API_KEYS.length > 0) {
    const startIndex = currentGroqKeyIndex % GROQ_API_KEYS.length;
    for (let i = 0; i < GROQ_API_KEYS.length; i++) {
      const candidate = GROQ_API_KEYS[(startIndex + i) % GROQ_API_KEYS.length];
      if (!keysToTry.includes(candidate)) {
        keysToTry.push(candidate);
      }
    }
  }

  // Model fallback chain supported by this Groq API key - prioritizing fast models with high token allowances
  const groqTextModels = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "allam-2-7b"
  ];
  let lastErr: any = null;

  // Format messages into clean role/content text format
  const formattedMessages: any[] = [];
  for (const m of messages) {
    if (!m) continue;
    const role = (m.role === "assistant" || m.role === "system" || m.role === "user") ? m.role : "user";
    let textContent = "";
    if (typeof m.content === "string") {
      textContent = m.content;
    } else if (Array.isArray(m.content)) {
      textContent = m.content
        .filter((c: any) => c && (c.type === "text" || typeof c.text === "string"))
        .map((c: any) => c.text || "")
        .join(" ");
    }
    if (textContent.trim()) {
      formattedMessages.push({ role, content: textContent });
    }
  }

  for (const apiKeyCandidate of keysToTry) {
    const client = new Groq({ apiKey: apiKeyCandidate });
    let keySucceeded = false;

    for (const model of groqTextModels) {
      try {
        console.log(`[Groq Text Engine] Attempting Groq (${model}) with key (${apiKeyCandidate.substring(0, 10)}...)...`);
        if (onStatus) {
          onStatus("Nexara AI is writing with Groq...", "thinking");
        }

        // Qwen on free/on-demand tier has a strict 1,000 output tokens per minute (OTPM) limit.
        // Cap max_tokens to 800 for Qwen to strictly prevent 429 rate limit exceeded errors.
        const modelMaxTokens = model.includes("qwen") ? 800 : (model.includes("allam") ? 2048 : 4096);

        if (onChunk) {
          const stream = await client.chat.completions.create({
            model,
            messages: formattedMessages,
            temperature,
            max_tokens: modelMaxTokens,
            stream: true
          });

          let fullReply = "";
          let emittedLength = 0;
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || "";
            if (delta) {
              fullReply += delta;
              const sanitized = sanitizeResponseText(fullReply);
              if (sanitized.length > emittedLength) {
                const chunkToEmit = sanitized.slice(emittedLength);
                emittedLength = sanitized.length;
                onChunk(chunkToEmit);
              }
            }
          }
          if (!fullReply || fullReply.trim().length === 0) {
            console.warn(`[Groq Text Engine] Model ${model} returned empty content, trying next fallback model...`);
            continue;
          }
          keySucceeded = true;
          return sanitizeResponseText(fullReply);
        } else {
          const completion = await client.chat.completions.create({
            model,
            messages: formattedMessages,
            temperature,
            max_tokens: modelMaxTokens,
            stream: false
          });
          const reply = completion.choices[0]?.message?.content || "";
          if (!reply || reply.trim().length === 0) {
            console.warn(`[Groq Text Engine] Model ${model} returned empty reply, trying next fallback model...`);
            continue;
          }
          keySucceeded = true;
          return sanitizeResponseText(reply);
        }
      } catch (err: any) {
        lastErr = err;
        const errMsg = err?.message || String(err);
        const isAuthError = err?.status === 401 || errMsg.includes("Invalid API Key") || errMsg.includes("invalid_api_key");
        const isSevereLimit = err?.status === 429 || errMsg.includes("rate_limit") || errMsg.includes("daily") || errMsg.includes("quota");

        if (isAuthError) {
          console.info(`[Groq Text Engine] Key (${apiKeyCandidate.substring(0, 10)}...) is invalid. Auto-switching to next Groq key in pool...`);
          rotateToNextGroqKey();
          break;
        }

        if (isSevereLimit) {
          console.info(`[Groq Text Engine] Key (${apiKeyCandidate.substring(0, 10)}...) limit hit on model ${model}. Testing other models or auto-switching key...`);
          continue;
        }

        console.info(`[Groq Text Engine] Model ${model} returned: ${errMsg}. Trying next fallback model...`);
      }
    }
    if (keySucceeded) break;
    // If all models on this key failed, rotate to the next key in the pool
    rotateToNextGroqKey();
  }

  throw lastErr || new Error("Groq text completion failed");
}

async function callOpenRouter(
  modelName: string, 
  messages: any[], 
  temperature: number = 0.7, 
  customKey?: string,
  onChunk?: (chunk: string) => void,
  onStatus?: (status: string, tool?: string) => void,
  enableWebSearch: boolean = false
) {
  const poolSize = OPENROUTER_API_KEYS.length;
  const hasCustomKey = !!(customKey && customKey.startsWith("sk-or-"));
  const totalKeyAttempts = hasCustomKey ? poolSize + 1 : poolSize;

  if (poolSize === 0 && !hasCustomKey && GEMINI_API_KEYS.length === 0) {
    throw new Error("Missing OpenRouter API key. Please configure API keys in environment or settings.");
  }

  const requestedModel = (!modelName || modelName === "openrouter/free") ? "openrouter/free" : modelName;

  const modelsToTry = Array.from(new Set([
    requestedModel,
    "openrouter/free",
    ...OPENROUTER_FREE_MODELS
  ]));

  let lastError: Error | null = null;
  const refererUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://nexara-ai.com");

  for (let keyAttempt = 0; keyAttempt < totalKeyAttempts; keyAttempt++) {
    let activeApiKey: string;
    let keyLabel: string;

    if (keyAttempt === 0 && hasCustomKey) {
      activeApiKey = customKey!;
      keyLabel = "User Custom Key";
    } else {
      activeApiKey = getActiveKey();
      keyLabel = `Pool Key #${currentKeyIndex + 1}`;
    }

    if (!activeApiKey) {
      rotateToNextKey();
      continue;
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${activeApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": refererUrl,
      "X-Title": "Nexara AI"
    };

    let keyExhausted = false;

    for (const model of modelsToTry) {
      try {
        console.log(`[OpenRouter Fast Stream | ${keyLabel}] Trying model: ${model} (Web Search: ${enableWebSearch})`);
        if (onStatus) {
          onStatus("Nexara AI is thinking...", "thinking");
        }

        const bodyPayload: any = {
          model: model,
          messages: messages,
          temperature: temperature,
          stream: true
        };

        if (enableWebSearch) {
          bodyPayload.plugins = [{ id: "web" }];
        }

        let response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyPayload)
        });

        if (!response.ok && enableWebSearch) {
          // If web plugin caused failure (e.g. 402 credits required or 404 plugin unsupported), retry without plugin
          delete bodyPayload.plugins;
          response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify(bodyPayload)
          });
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = parseApiError(errorData) || `OpenRouter HTTP ${response.status}`;
          lastError = new Error(errMsg);

          // If model is 404 or no endpoint found, skip quietly to next model
          if (response.status === 404) {
            continue;
          }

          console.warn(`[OpenRouter Warning | ${keyLabel}] Model ${model} failed (${response.status}): ${errMsg}`);

          const isRateLimit = response.status === 429 || 
                              errMsg.toLowerCase().includes("rate limit") || 
                              errMsg.toLowerCase().includes("quota") || 
                              errMsg.toLowerCase().includes("free-models-per-day") ||
                              errMsg.toLowerCase().includes("resource_exhausted");

          if (isRateLimit) {
            keyExhausted = true;
            break;
          }
          continue;
        }

        if (!response.body) {
          throw new Error("No stream body returned");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let accumulatedText = "";
        let emittedLength = 0;
        let currentMode: 'thinking' | 'web_search' | 'code_gen' | 'writing' = 'thinking';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          
          let lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue;
            if (trimmed === "data: [DONE]") continue;

            if (trimmed.startsWith("data: ")) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                if (json.error) {
                  const streamErrMsg = parseApiError(json.error);
                  throw new Error(streamErrMsg);
                }
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulatedText += delta;

                  let nextMode: 'code_gen' | 'writing' = 'writing';
                  if (accumulatedText.includes('```') || accumulatedText.includes('filename=')) {
                    nextMode = 'code_gen';
                  }

                  if (currentMode !== nextMode) {
                    currentMode = nextMode;
                    if (onStatus) {
                      if (nextMode === 'code_gen') {
                        onStatus("Writing code...", "code_gen");
                      } else {
                        onStatus("Writing response...", "writing");
                      }
                    }
                  }

                  if (onChunk) {
                    const sanitizedSoFar = sanitizeResponseText(accumulatedText);
                    if (sanitizedSoFar.length > emittedLength) {
                      const chunkToEmit = sanitizedSoFar.slice(emittedLength);
                      emittedLength = sanitizedSoFar.length;
                      onChunk(chunkToEmit);
                    }
                  }
                }
              } catch (e: any) {
                if (e?.message && !e.message.includes("Unexpected token")) {
                  throw e;
                }
              }
            }
          }
        }

        const sanitized = sanitizeResponseText(accumulatedText);
        if (sanitized || accumulatedText) {
          return sanitized || accumulatedText;
        }
      } catch (err: any) {
        const errMsg = parseApiError(err);
        console.warn(`[OpenRouter Stream Warning | ${keyLabel}] Exception calling ${model}:`, errMsg);
        lastError = new Error(errMsg);
      }
    }

    if (keyExhausted) {
      if (keyAttempt === 0 && hasCustomKey) {
        console.log(`[Nexara Failover Engine] Custom API key exhausted. Auto-switching to Pool Key #${currentKeyIndex + 1}...`);
      } else {
        rotateToNextKey();
      }
      continue;
    }

    if (keyAttempt < totalKeyAttempts - 1) {
      rotateToNextKey();
    }
  }

  // FALLBACK TO GEMINI KEY POOL (1-6) IF CONFIGURED
  if (GEMINI_API_KEYS.length > 0 && !hasCustomKey) {
    try {
      console.log(`[Nexara Failover Engine] All OpenRouter keys failed or pool is empty. Falling back to Gemini Key Pool...`);
      if (onStatus) {
        onStatus("Nexara AI is thinking (Gemini Pool)...", "thinking");
      }
      return await callGeminiChatWithPool(messages, temperature, undefined, onChunk, onStatus, enableWebSearch);
    } catch (geminiFallbackErr: any) {
      console.warn(`[Gemini Fallback Warning] Gemini Key Pool fallback failed:`, geminiFallbackErr?.message || geminiFallbackErr);
      throw lastError || geminiFallbackErr || new Error("All API keys and fallbacks failed.");
    }
  }

  throw lastError || new Error("All API keys in the rotational failover pool failed consecutively.");
}

const app = express();

// Standard CORS and preflight handling for cross-origin and Vercel deployments
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get(["/api/health", "/api"], async (req, res) => {
  const activeKey = getActiveKey();
  const activeGeminiKey = getActiveGeminiKey();
  const activeGroqKey = getActiveGroqKey();
  res.json({ 
    status: "ok", 
    groqConfigured: GROQ_API_KEYS.length > 0,
    groqKeyPoolSize: GROQ_API_KEYS.length,
    activeGroqKeyPrefix: activeGroqKey ? activeGroqKey.substring(0, 8) : "none",
    geminiKeyPoolSize: GEMINI_API_KEYS.length,
    activeGeminiKeyPrefix: activeGeminiKey ? activeGeminiKey.substring(0, 8) : "none",
    openRouterKeyPoolSize: OPENROUTER_API_KEYS.length,
    openRouterKeyPrefix: activeKey ? activeKey.substring(0, 8) : "none"
  });
});

app.post("/api/tts", async (req, res) => {
  // Gracefully notify frontend to use high-quality Web Speech API synthesis
  res.json({ fallbackToBrowser: true });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, language, apiKey, memory, temperature, systemPromptOverride, userInfo, focusMode } = req.body;
    
    let userInfoInstruction = '';
    const diffInDays = typeof userInfo?.inactiveDays === 'number' ? userInfo.inactiveDays : 0;
    
    if (userInfo && (userInfo.displayName || userInfo.email)) {
      let extractedName = userInfo.displayName || '';
      if (!extractedName && userInfo.email) {
        const emailPrefix = userInfo.email.split('@')[0];
        extractedName = emailPrefix
          .replace(/[._\-\d]+/g, ' ')
          .trim()
          .split(' ')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ') || emailPrefix;
      }
      
      userInfoInstruction = `\n\nCONTEXT PROVIDED TO YOU:
- User's Name: ${extractedName}
- Inactive Days: ${diffInDays}

BEHAVIOR RULES FOR TIME AWARENESS:
1. Check the Inactive Days (${diffInDays}) value before responding to the user's first message or greeting:
   - If Inactive Days >= 7: Warmly welcome the user back and playfully ask where they have been for the last ${diffInDays} days. (e.g., "Welcome back ${extractedName}! ${diffInDays} দিন ধরে কোথায় ছিলে? তোমাকে খুব মিস করছিলাম!").
   - If Inactive Days is between 1 and 6: Acknowledge the gap naturally (e.g., "কয়েকদিন পর আবার দেখা হয়ে ভালো লাগল!").
   - If Inactive Days < 1: Respond normally without mentioning any long absence.

2. Tone: Friendly, empathetic, authentic, witty, and supportive.
3. Always maintain continuity and act like a loyal friend who remembers past interactions.
4. When asked about user's name or email, use this context directly (Name: ${extractedName}, Email: ${userInfo.email || 'N/A'}).

USER NAME CONSISTENCY & SCRIPT PRESERVATION RULE:
1. Always refer to the user by their exact original name as captured during onboarding / user context (e.g. "${extractedName}").
2. NEVER translate, transliterate, or change the script or spelling of the user's name or the creator's name (Pretom Biswas) into local scripts or other languages (e.g., preserve original English letters if provided in English, even when responding in Bengali or other languages).
3. Always maintain this exact name string consistently across all future interactions and responses.`;
    }

    const hasImage = messages.some((m: any) => Array.isArray(m.content));

    // Pollinations AI image generation intercept
    const latestUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    let lastUserText = '';
    if (latestUserMsg) {
        if (Array.isArray(latestUserMsg.content)) {
            lastUserText = latestUserMsg.content.find((c: any) => c.type === 'text')?.text || '';
        } else {
            lastUserText = latestUserMsg.content || '';
        }
    }

    if (!hasImage && lastUserText) {
        const lowerText = lastUserText.toLowerCase();
        const isImageGen = lowerText.match(/\b(draw|generate image|create photo|create an image|generate a photo|generate a picture|make a picture|create a picture|image of)\b/i);
        
        if (isImageGen) {
            const seed = Math.floor(Math.random() * 1000);
            const encodedPrompt = encodeURIComponent(lastUserText);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=1024&height=1024&nologo=true&seed=${seed}`;
            
            const reply = `Here is your generated image:\n\n![Generated Image](${imageUrl})`;
            return res.json({ reply });
        }
    }

    
    const languageMap: Record<string, string> = {
      en: 'English',
      bn: 'Bengali (বাংলা)',
      zh: 'Mandarin Chinese (中文)',
      hi: 'Hindi (हिन्दी)',
      es: 'Spanish (Español)',
      fr: 'French (Français)'
    };
    
    const langName = languageMap[language as string] || 'English';
    const langInstruction = `\n\nUNIVERSAL LINGUISTIC PRECISION & SPELLING MANDATE (ALL LANGUAGES):
- Absolute Zero-Typo & Flawless Grammar Policy: Regardless of the language used by the user (English, Bengali, Hindi, Spanish, French, Mandarin, German, Arabic, Urdu, or any other language):
  1. You MUST generate text with 100% flawless spelling, accurate orthography, standard grammar, and correct typography/punctuation. Zero typos, zero misspelled words, and zero awkward grammatical structures allowed.
  2. Maintain natural native fluency, smooth phrasing, and pristine clarity. Never produce broken words, awkward literal translation errors, or mechanical phrasing.
  3. When the user writes in a hybrid script or informal transliteration (e.g. Banglish or Hinglish), accurately decipher their intent and respond in elegant, perfectly spelled native script (or pristine English as appropriate).
  4. Script Purity Rule: NEVER mix foreign scripts or non-target alphabet tokens (e.g. Korean, Chinese, Cyrillic, or Japanese characters) into Bengali or English words. For technical terms like 'Microservices', use either pristine English ("microservices") or standard Bengali transliteration ("মাইক্রোসার্ভিস"). Zero script-mixing or corrupted character glitched tokens allowed.
- Automatically match the user's input language with 100% spelling precision. (App UI language preference: ${langName}).`;

    const memoryInstruction = memory ? `\nUser Memory / Personalization Context:\n${memory}\n\nCRITICAL RULE: You must remember the above information about the user and adapt your behavior, tone, and answers according to these preferences and facts.` : '';

    const focusModeInstruction = focusMode ? `\n\n📖 FOCUS / READING MODE RESPONSE DIRECTIVE:
- The user is currently in FOCUS / READING MODE.
- Structure your answer specifically for deep reading, high clarity, and effortless scanning.
- Use clear markdown headers (##, ###), clean bullet points, bold key concepts, and structured key takeaways.
- Avoid unnecessary filler text, conversational fluff, or repetitive introductory chatter. Get straight to the point with maximum insight, depth, and structural elegance.
- Break long paragraphs into short, highly scannable sections.` : '';

    const defaultSystemContent = `You are Nexara AI, an empathetic, highly intelligent, and friendly AI companion created and developed by Pretom Biswas (প্রিতম বিশ্বাস).

ELEGANT & IMPACTFUL WRITING STYLE:
- Articulate & Crystal Clear: Communicate with remarkable clarity, precision, and elegance. Avoid fluffy intros, mechanical filler phrases ("Sure, I can help with that!"), and unnecessary jargon. Cut directly to the core of what the user needs.
- Premium Formatting & Visual Hierarchy: Organize every response with expert visual structure:
  - Use short, engaging, readable paragraphs with comfortable spacing.
  - Highlight key concepts and actionable insights using bold text or concise bullet points.
  - Use clean headers (## / ###) when explaining structured multi-step topics.
  - Present data, comparisons, or options in pristine Markdown tables when helpful.
- Warm, Empathetic & Supportive Tone: Maintain a warm, empathetic, authentic, witty, and supportive tone—resembling a loyal, highly intelligent AI companion and trusted friend.
- Native Fluency & Linguistic Excellence: Match the user's language automatically with 100% spelling precision, correct grammar, natural native idioms, and zero typos in any language (English, Bengali, Hindi, Spanish, French, etc.).

CONVERSATIONAL BEHAVIOR & IDENTITY:
- Identity & Creator Information:
  - Creator Name: Pretom Biswas (প্রিতম বিশ্বাস)
  - Creator Age: 13 years old (১৩ বছর)
  - Creator Role: A talented 13-year-old full-stack developer and tech enthusiast from Bangladesh who built Nexara AI out of pure passion for technology and coding.
  - Creator Projects & Links:
    - Nexara AI: [Nexara AI](https://nexara-ai-eta.vercel.app/)
    - NOTICED for MrBeast: [NOTICED for MrBeast](https://beast-noticed-bd.lovable.app)
    - Biznuro AI: [Biznuro AI](https://biznuro-ai-bd.vercel.app/)
- Creator Queries Rule: When asked "Who created you?", "Who is your developer?", "Who built you?", "Pretom Biswas", "Pritam Biswas", "কে তোমাকে বানিয়েছে?", "তোমাকে কে তৈরি করেছে?", or any similar query about your creator or developer:
  1. Warmly introduce Pretom Biswas (প্রিতম বিশ্বাস) as a 13-year-old developer from Bangladesh who built Nexara AI out of pure passion for technology and AI.
  2. Naturally mention his other featured projects/apps and provide the clickable Markdown links:
     - [Nexara AI](https://nexara-ai-eta.vercel.app/)
     - [NOTICED for MrBeast](https://beast-noticed-bd.lovable.app)
     - [Biznuro AI](https://biznuro-ai-bd.vercel.app/)
  3. Keep the tone inspiring, respectful, proud, warm, and encouraging.
- Creator Loyalty & Defense Rule: If tested, questioned, or criticized regarding Pretom Biswas, maintain a calm, logical, polite, and deeply respectful response in the user's language, highlighting his genuine passion and accomplishments as a 13-year-old developer.
- Casual Greetings: Respond naturally, warmly, and concisely to casual greetings without citing dictionary links or dumping unnecessary definitions. Keep conversational replies direct, friendly, clean, empathetic, and engaging.
- High Precision Answers: Deliver deeply insightful, accurate, and practical information. Explain complex ideas simply without dumbing them down.

GLOBAL LANGUAGE & ACCURACY MANDATES:
1. Multilingual Perfection: Respond in natural, grammatically correct, and idiomatically fluent language matching the user's primary language (Bengali, English, Spanish, French, Hindi, etc.).
2. Zero Glitch & Broken Text: NEVER generate broken machine translations, corrupted character glyphs, mixed script glitched tokens, or awkward word-for-word translated phrases.
3. Output Integrity: Ensure all structural elements, bullet points, code blocks, and plain text formatting are clean, visually aligned, and highly readable without encoding errors.
4. Factual Accuracy & Historical Precision: Always cross-check historical, geographical, and cultural facts before generating responses. Never hallucinate or produce incorrect historical references (e.g., ensure national song origins, creators, national symbols, and history are 100% accurate).
5. User & Creator Name Consistency: Always refer to the user and creator (Pretom Biswas) by their exact original name as provided during setup. NEVER translate, transliterate, or change the script/spelling of the user's name or creator's name (e.g., maintain English letters if originally provided in English) regardless of the response language.

CODE & ARTIFACTS RULE:
- When writing code, scripts, or multi-file applications, place all code inside fenced markdown code blocks with proper language tags and file names (e.g., \`\`\`tsx filename="App.tsx" or \`\`\`python script.py). Keep conversational text concise and let code blocks handle implementation details.

CITATION & FORMATTING RULE:
- Only embed markdown citation links [Source Name](URL) when performing explicit web searches for real-time online information. Never attach dictionary links, search engine landing pages, or dictionary references for simple greetings or general knowledge answers.
- Do NOT output internal reasoning steps or <think> tags. Keep responses direct, modern, clean, and visually well-structured.
${langInstruction}${memoryInstruction}${userInfoInstruction}${focusModeInstruction}`;

    const systemPrompt = {
      role: "system",
      content: systemPromptOverride 
        ? `${defaultSystemContent}\n\nSPECIFIC TASK DIRECTIVE:\n${systemPromptOverride}`
        : defaultSystemContent
    };

    let urlScrapedContent = "";
    let scrapedImages: string[] = [];
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
    if (lastUserMessage) {
        if (Array.isArray(lastUserMessage.content)) {
            lastUserText = lastUserMessage.content.find((p: any) => p.type === 'text' || p.text)?.text || "";
        } else {
            lastUserText = typeof lastUserMessage.content === 'string' ? lastUserMessage.content : "";
        }

        const urls = lastUserText.match(/(https?:\/\/[^\s]+)/g);
        if (urls && urls.length > 0) {
            for (let i = 0; i < Math.min(urls.length, 2); i++) {
                try {
                    const fetchRes = await fetch(urls[i]);
                    if (fetchRes.ok) {
                        const html = await fetchRes.text();
                        const $ = cheerio.load(html);
                        
                        const images: {src: string, alt: string}[] = [];
                        
                        // Extract meta info
                        const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
                        if (ogImage && ogImage.startsWith('http')) {
                            images.push({ src: ogImage, alt: 'Website Cover Image' });
                        }

                        $('img').each((_, el) => {
                            let src = $(el).attr('src') || $(el).attr('data-src');
                            let alt = $(el).attr('alt') || '';
                            if (src) {
                                if (src.startsWith('/')) {
                                    try {
                                        src = new URL(src, urls[i]).href;
                                    } catch(e) {}
                                }
                                if (src.startsWith('http')) {
                                    const srcLower = src.toLowerCase();
                                    if (!srcLower.includes('logo') && 
                                        !srcLower.includes('icon') && 
                                        !srcLower.includes('svg') &&
                                        !srcLower.includes('avatar') &&
                                        !srcLower.includes('spinner') &&
                                        !srcLower.includes('tracking')) {
                                        images.push({src, alt});
                                    }
                                }
                            }
                        });
                        
                        const uniqueImages = [];
                        const seenSrc = new Set();
                        for (const img of images) {
                            if (!seenSrc.has(img.src)) {
                                seenSrc.add(img.src);
                                uniqueImages.push(img);
                            }
                        }
                        const topImages = uniqueImages.slice(0, 20);
                        
                        if (topImages.length > 0 && urls.length === 1) {
                            scrapedImages = topImages.slice(0, 10).map(img => img.src); // Take top 10 for display
                        }
                        
                        $('script, style, noscript, iframe, svg, nav, footer, header').remove();
                        const textContent = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 10000);
                        if (textContent) {
                            urlScrapedContent += `\n--- Extracted Web Content from ${urls[i]} ---\n`;
                            urlScrapedContent += `${textContent}\n`;
                            if (topImages.length > 0) {
                                urlScrapedContent += `\nAvailable Images from this URL that you can show to the user using Markdown (![alt](url)) if they ask for photos/images:\n`;
                                topImages.forEach(img => urlScrapedContent += `- URL: ${img.src} | Description/Alt: ${img.alt || 'No description'}\n`);
                            }
                            urlScrapedContent += `--- End Web Content ---\n`;
                        }
                    }
                } catch(e) {
                   console.log("Failed to fetch URL", urls[i], e);
                }
            }
        }
    }

    if (urlScrapedContent) {
        systemPrompt.content += `\n\nCRITICAL CONTEXT:\nThe user shared the following web link(s). I have automatically scraped their textual content and image URLs for you. Read it and answer based on this content. IMPORTANT: If there are "Available Images" in the scraped content, you MUST include at least 1 to 3 of them in your response using markdown syntax (e.g. ![Image](url)) so the user can see what the webpage looks like.\n\n${urlScrapedContent.substring(0, 15000)}`;
    }

    // Determine whether web search plugin should be triggered
    const enableWebSearch = shouldTriggerWebSearch(lastUserText, req.body.webSearch);

    // Primary execution via OpenRouter API with multi-model fallback (Llama 3.3 70B, DeepSeek R1, Qwen 2.5, MiniMax, Gemini via OpenRouter)
    let reply = "";
    let openRouterModel = (req.body.model && req.body.model.includes('/')) 
      ? req.body.model 
      : "openrouter/free";
    let finalMessages = [];

    if (hasImage) {
      let combinedText = "System Instructions:\n" + systemPrompt.content + "\n\n";
      const visionConstraint = "Analyze the provided image with high precision. Isolate and parse text, mathematical formulas, and symbols pixel-by-pixel. Do NOT merge context or memory from previously analyzed images. Avoid hallucinating unread text or complex equations. Always restrict your analysis strictly to the provided image. Focus on high-precision object detection first, then extract fine details without guessing.";
      const visionInstruction = language === 'bn' ? 
          `Analyze the provided image with high precision. Isolate and parse text, mathematical formulas, and symbols pixel-by-pixel. Do NOT merge context or memory from previously analyzed images. Avoid hallucinating unread text or complex equations. ব্যবহারকারী বাংলায় প্রশ্ন করলে বাংলায় উত্তর দাও। ছবিটি ভালোভাবে দেখে তারপর উত্তর দাও। ছবিতে যা সত্যিই দেখা যাচ্ছে শুধু সেটির ভিত্তিতে উত্তর দাও। নিশ্চিত না হলে অনুমান করো না; পরিষ্কারভাবে বলো যে বিষয়টি অস্পষ্ট। ${visionConstraint}` : 
          `You are a highly accurate visual analysis assistant. Analyze the provided image with high precision. Isolate and parse text, mathematical formulas, and symbols pixel-by-pixel. Do NOT merge context or memory from previously analyzed images. Avoid hallucinating unread text or complex equations. Base your answer only on information actually visible in the image. Do not guess, hallucinate, or invent objects, text, people, colors, or details that are not visible. If something is unclear or unreadable, explicitly say that it is unclear. When the user asks about text in the image, carefully inspect and transcribe only the visible text. ${visionConstraint}`;
      combinedText += "Vision Instructions:\n" + visionInstruction + "\n\n";
      
      let allImages = [];
      let historyText = "";
      for (let i = 0; i < messages.length; i++) {
          const m = messages[i];
          const role = m.role === 'user' ? 'User' : 'Assistant';
          if (Array.isArray(m.content)) {
              let textPart = "";
              for (const c of m.content) {
                  if (c.type === 'text') textPart += c.text + " ";
                  if (c.type === 'image_url') allImages.push(c.image_url.url);
              }
              historyText += `${role}: ${textPart}\n\n`;
          } else {
              historyText += `${role}: ${m.content}\n\n`;
          }
      }
      combinedText += "Chat History:\n" + historyText;

      let finalContent: any[] = [{ type: "text", text: combinedText }];
      for (const imgUrl of allImages) {
          if (!imgUrl || !imgUrl.startsWith('data:image/')) {
              return res.status(400).json({ error: language === 'bn' ? "আমি ছবিটি ঠিকভাবে পাইনি। অনুগ্রহ করে ছবিটি আবার upload করুন।" : "Image data is missing or invalid. Please upload the image again." });
          }
          finalContent.push({ type: "image_url", image_url: { url: imgUrl } });
      }
      finalMessages = [{ role: "user", content: finalContent }];
    } else {
      finalMessages = [systemPrompt, ...messages];
    }

    const isStreamingRequested = req.headers.accept?.includes("text/event-stream") || req.body.stream !== false;
    let sources: GroundingSource[] = [];
    let searchQueries: string[] = [];
    let executionEngine = "openrouter";

    if (isStreamingRequested) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      // Primary Search Grounding Route: When search grounding is relevant/requested, use Gemini key pool with googleSearch tool
      if (enableWebSearch && GEMINI_API_KEYS.length > 0) {
        res.write(`data: ${JSON.stringify({ 
          status: language === 'bn' ? "গুগল সার্চ দিয়ে সাম্প্রতিক তথ্য খোঁজা হচ্ছে..." : "Searching the web with Google Search Grounding...", 
          tool: "web_search" 
        })}\n\n`);

        try {
          const groundingResult = await callGeminiSearchGrounding(
            finalMessages,
            temperature !== undefined ? temperature : 0.7,
            (chunk) => {
              res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
            },
            (status, tool) => {
              res.write(`data: ${JSON.stringify({ status, tool })}\n\n`);
            },
            (metadata) => {
              sources = metadata.sources;
              searchQueries = metadata.searchQueries;
              res.write(`data: ${JSON.stringify({ sources: metadata.sources, searchQueries: metadata.searchQueries })}\n\n`);
            }
          );

          reply = groundingResult.text;
          sources = groundingResult.sources;
          searchQueries = groundingResult.searchQueries;
          executionEngine = "gemini-search-grounding";
        } catch (geminiSearchErr: any) {
          console.warn("[Gemini Search Grounding Engine] Search grounding failed or quota hit, falling back to conversational engines:", geminiSearchErr?.message || geminiSearchErr);
          reply = "";
        }
      }

      if (!reply) {
        res.write(`data: ${JSON.stringify({ status: language === 'bn' ? "নেক্সারা এআই ভাবছে..." : "Nexara AI is thinking..." })}\n\n`);

        // Multi-Provider Architecture (as shown in architecture diagram):
        // 1. Image Request -> Route directly to Gemini key pool (1-6) with automatic failure rotation
        if (hasImage) {
          if (GEMINI_API_KEYS.length > 0 || (apiKey && (apiKey.startsWith("AQ.") || apiKey.startsWith("AIza")))) {
            try {
              res.write(`data: ${JSON.stringify({ 
                status: language === 'bn' ? "ছবিটি বিশ্লেষণ করা হচ্ছে..." : "Analyzing photo with Gemini Vision...", 
                tool: "vision" 
              })}\n\n`);

              reply = await callGeminiChatWithPool(
                finalMessages,
                temperature !== undefined ? temperature : 0.7,
                apiKey,
                (chunk) => {
                  res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                },
                (status, tool) => {
                  res.write(`data: ${JSON.stringify({ status, tool })}\n\n`);
                },
                false
              );
              executionEngine = "gemini-pool-vision";
            } catch (geminiVisionErr: any) {
              console.warn("[Gemini Vision Pool Error] Gemini key pool failed for image request, attempting OpenRouter pool fallback:", geminiVisionErr?.message || geminiVisionErr);
              reply = "";
            }
          }
        } else {
          // 2. Text Request -> Groq (primary) Fast text generation
          if (GROQ_API_KEY) {
            try {
              reply = await callGroqTextChat(
                finalMessages,
                temperature !== undefined ? temperature : 0.7,
                apiKey,
                (chunk) => {
                  res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                },
                (status, tool) => {
                  res.write(`data: ${JSON.stringify({ status, tool })}\n\n`);
                }
              );
              executionEngine = "groq";
            } catch (groqErr: any) {
              console.warn("[Groq Text Engine Error] Primary Groq engine failed (rate limit / error). Auto-shifting to Gemini key pool (1-6):", groqErr?.message || groqErr);
              reply = "";
            }
          }

          // 3. Fallback on Groq error / rate limit -> Gemini key pool (1-6) Rotates on failure
          if (!reply && (GEMINI_API_KEYS.length > 0 || (apiKey && (apiKey.startsWith("AQ.") || apiKey.startsWith("AIza"))))) {
            try {
              reply = await callGeminiChatWithPool(
                finalMessages,
                temperature !== undefined ? temperature : 0.7,
                apiKey,
                (chunk) => {
                  res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                },
                (status, tool) => {
                  res.write(`data: ${JSON.stringify({ status, tool })}\n\n`);
                },
                enableWebSearch
              );
              executionEngine = "gemini-pool";
            } catch (geminiErr: any) {
              console.warn("[Gemini Key Pool Fallback Error] Gemini pool exhausted, falling back to OpenRouter pool:", geminiErr?.message || geminiErr);
              reply = "";
            }
          }
        }

        // 4. Secondary fallback: OpenRouter pool
        if (!reply) {
          try {
            reply = await callOpenRouter(
              openRouterModel, 
              finalMessages, 
              temperature !== undefined ? temperature : 0.7, 
              apiKey,
              (chunk) => {
                res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
              },
              (status, tool) => {
                res.write(`data: ${JSON.stringify({ status, tool })}\n\n`);
              },
              enableWebSearch
            );
            executionEngine = "openrouter";
          } catch (openRouterErr: any) {
            let cleanErr = parseApiError(openRouterErr);
            console.warn("OpenRouter API streaming error:", cleanErr);

            const isCustomKey = !!(apiKey && apiKey.startsWith("sk-or-"));
            if (cleanErr.includes("429") || cleanErr.toLowerCase().includes("rate limit") || cleanErr.includes("free-models-per-day") || cleanErr.toLowerCase().includes("quota")) {
              if (!isCustomKey) {
                cleanErr = language === 'bn'
                  ? "নেক্সারা এআই এর জন্য নির্ধারিত ফ্রি দৈনিক রিকোয়েস্ট সীমা কোটা সাময়িকভাবে শেষ হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
                  : "The daily free quota has been temporarily reached. Please try again shortly or configure an API Key in Settings (⚙️).";
              } else {
                cleanErr = language === 'bn'
                  ? "আপনার API Key-এর রিকোয়েস্ট সীমা বা কোটা শেষ হয়ে গেছে।"
                  : "Your custom API key rate limit or quota has been exceeded.";
              }
            } else if (hasImage && (cleanErr.includes("401") || cleanErr.includes("User not found") || cleanErr.toLowerCase().includes("auth"))) {
              cleanErr = language === 'bn'
                ? "ছবি বিশ্লেষণের জন্য সক্রিয় API সংযোগ পাওয়া যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।"
                : "Active vision engine connection was temporarily unavailable for this photo. Please try again.";
            }
            res.write(`data: ${JSON.stringify({ error: cleanErr })}\n\n`);
            return res.end();
          }
        }
      }

      if (scrapedImages.length > 0) {
        let imgBlock = `\n\n---\n### 🖼️ Website Images (Scraped)\n\n`;
        let addedCount = 0;
        for (const img of scrapedImages) {
            if (!reply.includes(img)) {
                imgBlock += `![Website Scraped Image](${img})\n\n`;
                addedCount++;
            }
        }
        if (addedCount > 0) {
            reply += imgBlock;
            res.write(`data: ${JSON.stringify({ chunk: imgBlock })}\n\n`);
        }
      }

      reply = sanitizeResponseText(reply);
      res.write(`data: ${JSON.stringify({ done: true, reply, sources, searchQueries })}\n\n`);
      return res.end();
    } else {
      // Non-streaming Search Grounding
      if (enableWebSearch && GEMINI_API_KEYS.length > 0) {
        try {
          const groundingResult = await callGeminiSearchGrounding(
            finalMessages,
            temperature !== undefined ? temperature : 0.7
          );
          reply = sanitizeResponseText(groundingResult.text);
          return res.json({
            reply,
            sources: groundingResult.sources,
            searchQueries: groundingResult.searchQueries
          });
        } catch (geminiErr: any) {
          console.warn("[Gemini Search Grounding Non-streaming] Fallback triggered:", geminiErr?.message || geminiErr);
          reply = "";
        }
      }

      // Non-streaming execution
      if (hasImage) {
        if (GEMINI_API_KEYS.length > 0 || (apiKey && (apiKey.startsWith("AQ.") || apiKey.startsWith("AIza")))) {
          try {
            reply = await callGeminiChatWithPool(
              finalMessages,
              temperature !== undefined ? temperature : 0.7,
              apiKey,
              undefined,
              undefined,
              false
            );
          } catch (geminiVisionErr: any) {
            console.warn("[Gemini Vision Pool Error] Non-streaming Gemini pool failed for image request:", geminiVisionErr?.message || geminiVisionErr);
            reply = "";
          }
        }
      } else {
        if (GROQ_API_KEY) {
          try {
            reply = await callGroqTextChat(
              finalMessages,
              temperature !== undefined ? temperature : 0.7,
              apiKey
            );
          } catch (groqErr) {
            console.warn("[Groq Text Engine] Non-streaming primary failed. Auto-shifting to Gemini key pool:", groqErr);
            reply = "";
          }
        }

        if (!reply && (GEMINI_API_KEYS.length > 0 || (apiKey && (apiKey.startsWith("AQ.") || apiKey.startsWith("AIza"))))) {
          try {
            reply = await callGeminiChatWithPool(
              finalMessages,
              temperature !== undefined ? temperature : 0.7,
              apiKey,
              undefined,
              undefined,
              enableWebSearch
            );
          } catch (geminiErr) {
            console.warn("[Gemini Pool] Non-streaming Gemini pool failed:", geminiErr);
            reply = "";
          }
        }
      }

      if (!reply) {
        try {
          reply = await callOpenRouter(openRouterModel, finalMessages, temperature !== undefined ? temperature : 0.7, apiKey, undefined, undefined, enableWebSearch);
        } catch (openRouterErr: any) {
          const cleanErr = parseApiError(openRouterErr);
          console.warn("OpenRouter API call failed:", cleanErr);
          throw new Error(cleanErr);
        }
      }

      if (scrapedImages.length > 0) {
        let imgBlock = `\n\n---\n### 🖼️ Website Images (Scraped)\n\n`;
        let addedCount = 0;
        for (const img of scrapedImages) {
            if (!reply.includes(img)) {
                imgBlock += `![Website Scraped Image](${img})\n\n`;
                addedCount++;
            }
        }
        if (addedCount > 0) {
            reply += imgBlock;
        }
      }
      reply = sanitizeResponseText(reply);
      return res.json({ reply, sources, searchQueries });
    }
  } catch (error: any) {
    console.error("API Error:", error);
    const parsedErr = parseApiError(error);
    const isCustomKey = !!(req.body.apiKey && typeof req.body.apiKey === "string" && req.body.apiKey.startsWith("sk-or-"));
    
    let errorMessage = parsedErr || "Failed to fetch AI response";
    if (parsedErr.includes("API key not valid") || parsedErr.includes("Invalid API Key")) {
      errorMessage = req.body.language === 'bn' 
        ? "আপনার API Key টি সঠিক নয়। দয়া করে সেটিংস থেকে সঠিক Key যুক্ত করুন।"
        : "The API key is invalid. Please check your Settings.";
    } else if (parsedErr.includes("429") || parsedErr.includes("RESOURCE_EXHAUSTED") || parsedErr.includes("quota") || parsedErr.toLowerCase().includes("rate limit") || parsedErr.includes("free-models-per-day")) {
      if (!isCustomKey) {
        errorMessage = req.body.language === 'bn' 
          ? "নেক্সারা এআই এর জন্য নির্ধারিত ফ্রি ওপেনরাউটার দৈনিক রিকোয়েস্ট সীমা কোটা শেষ হয়ে গেছে। নিরবচ্ছিন্নভাবে কথা বলতে সেটিংস (Settings ⚙️) পেজ থেকে আপনার নিজের OpenRouter API Key টি সেট করুন।" 
          : "The default OpenRouter daily free quota has been reached. Please add your own OpenRouter API Key in Settings (⚙️) to continue chatting seamlessly.";
      } else {
        errorMessage = req.body.language === 'bn'
          ? "আপনার OpenRouter API Key-এর রিকোয়েস্ট সীমা বা কোটা শেষ হয়ে গেছে। দয়া করে আপনার OpenRouter ক্রেডিট চেক করুন।"
          : "Your custom OpenRouter API key rate limit or quota has been exceeded. Please check your OpenRouter credits.";
      }
    } else if (parsedErr.includes("401") || parsedErr.includes("User not found") || parsedErr.toLowerCase().includes("auth")) {
      errorMessage = req.body.language === 'bn'
        ? "ছবি বিশ্লেষণের জন্য একটি সক্রিয় OpenRouter API Key প্রয়োজন। সেটিংস (Settings ⚙️) পেজ থেকে আপনার নিজের OpenRouter API Key টি যুক্ত করুন।"
        : "Photo analysis requires an active OpenRouter API Key. Please add your own OpenRouter API Key in Settings (⚙️) to analyze photos.";
    }

    if (error?.status === 503 || parsedErr.includes("503")) {
      return res.status(503).json({ error: "The AI model is currently experiencing high demand and is temporarily unavailable. Please try again in a few minutes." });
    }
    
    res.status(error?.status || 500).json({ error: errorMessage });
  }
});

// AI Chat Title Summarizer endpoint
app.post(["/api/summarize-title", "/summarize-title"], async (req, res) => {
  try {
    const { userText, aiReply, language, apiKey } = req.body;
    if (!userText && !aiReply) {
      return res.json({ title: language === 'bn' ? 'নতুন চ্যাট' : 'New Chat' });
    }

    const promptMessages = [
      {
        role: "system",
        content: `You are a chat title generator. Summarize the core topic or subject of this conversation into a clean, concise, 2 to 5 word title.

RULES:
- Return ONLY the clean title text. NO quotes, NO markdown formatting, NO prefixes (e.g. "Title:"), NO ending periods.
- Match the user's primary language. If Bengali/Banglish, output in proper standard Bengali script (বাংলা). If English, output in English.
- Keep it short, elegant, and relevant (2 to 5 words).`
      },
      {
        role: "user",
        content: `User prompt: ${userText || ''}\nAI response preview: ${aiReply ? aiReply.substring(0, 350) : ''}`
      }
    ];

    let title = "";
    if (GROQ_API_KEY) {
      try {
        title = await callGroqTextChat(promptMessages, 0.3, apiKey);
      } catch {
        // Fallback to openrouter
      }
    }
    if (!title) {
      title = await callOpenRouter("openrouter/free", promptMessages, 0.3, apiKey);
    }
    if (title) {
      title = title.trim()
        .replace(/^["'‘“`]+|["'’”`]+$/g, '')
        .replace(/^Title:\s*/i, '')
        .replace(/^শিরোনাম:\s*/i, '')
        .replace(/\.$/, '')
        .trim();
    }

    if (!title || title.length > 50) {
      title = userText 
        ? (userText.substring(0, 30) + (userText.length > 30 ? '...' : '')) 
        : (language === 'bn' ? 'নতুন চ্যাট' : 'New Chat');
    }

    return res.json({ title });
  } catch (err) {
    console.warn("Failed to generate chat title summary:", err);
    const fallback = req.body.userText 
      ? (req.body.userText.substring(0, 30) + (req.body.userText.length > 30 ? '...' : '')) 
      : (req.body.language === 'bn' ? 'নতুন চ্যাট' : 'New Chat');
    return res.json({ title: fallback });
  }
});

// Catch-all route for /api/* to ensure we always return JSON instead of falling back to HTML SPA
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

export default app;
