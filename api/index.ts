
import express from "express";
import dotenv from "dotenv";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { 
  getApiKey, 
  saveApiKeySetting, 
  deleteApiKeySetting, 
  updateApiKeyStatus, 
  listMaskedApiSettings 
} from "./settingsStore.js";

dotenv.config({ override: true });

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface SearchImage {
  url: string;
  sourceTitle: string;
}

// xKiro Key Pool for reliable access to Qwen 3.5 models
const RAW_XKIRO_KEYS = [
  process.env.XKIRO_API_KEY,
  process.env.XKIRO_API_KEY_1
];

export const XKIRO_API_KEYS = Array.from(
  new Set(
    RAW_XKIRO_KEYS.filter((k): k is string => 
      typeof k === 'string' && 
      k.trim().length > 10 && 
      !k.startsWith("gsk_") // Strictly exclude Groq keys from xKiro pool
    )
  )
);

let currentXkiroKeyIndex = 0;

export function getActiveXkiroKey(customKey?: string): string {
  // If customKey is provided but it's a Groq key, don't use it for xKiro
  if (customKey && customKey.startsWith("gsk_")) {
    console.warn(`[xKiro] Received Groq key (${customKey.substring(0, 8)}...) for xKiro engine. Falling back to pool.`);
    return getActiveXkiroKey(); // Recursive call without customKey to use pool
  }
  if (customKey && customKey.length > 5) return customKey;
  if (XKIRO_API_KEYS.length === 0) return "";
  return XKIRO_API_KEYS[currentXkiroKeyIndex % XKIRO_API_KEYS.length];
}

export function rotateToNextXkiroKey(): string {
  if (XKIRO_API_KEYS.length <= 1) return getActiveXkiroKey();
  currentXkiroKeyIndex = (currentXkiroKeyIndex + 1) % XKIRO_API_KEYS.length;
  console.log(`[xKiro Key Pool] Rotating to Key #${currentXkiroKeyIndex + 1}...`);
  return getActiveXkiroKey();
}

export function parseApiError(err: any): string {
  if (!err) return "An unknown error occurred.";

  let msg = "";
  if (typeof err === "string") {
    msg = err.trim();
  } else if (typeof err === "object") {
    // Handle nested error objects from various SDKs
    if (err.message && typeof err.message === "string") msg = err.message;
    else if (err.error && typeof err.error === "string") msg = err.error;
    else if (err.error && typeof err.error === "object") {
       if (err.error.message) msg = err.error.message;
       else msg = JSON.stringify(err.error);
    }
    else if (err.status && err.status === "PERMISSION_DENIED") msg = "Permission Denied: Your API key does not have access to this project or model.";
    else if (err.status && err.status === "UNAUTHENTICATED") msg = "Unauthenticated: Your API key is invalid or has expired.";
    else {
      try {
        msg = JSON.stringify(err);
      } catch {
        msg = String(err);
      }
    }
  }

  // Deep parse: if the resulting message is itself a JSON string (common in Gemini SDK), parse it recursively
  if (typeof msg === "string" && (msg.trim().startsWith("{") || msg.trim().startsWith("["))) {
    try {
      const parsed = JSON.parse(msg);
      return parseApiError(parsed);
    } catch {
      // Not valid JSON, keep original msg
    }
  }

  if (msg === "[object Object]") return "An unexpected API error occurred.";
  
  // Specific cleanups for common verbose errors
  if (msg.includes("Your project has been denied access")) return "Access Denied: Your Google Cloud project is restricted or the Generative Language API is not enabled for this key.";
  if (msg.includes("Request had invalid authentication credentials")) return "Invalid Key: The provided API key is either incorrect, expired, or has the wrong permissions.";
  
  return msg || "An unknown error occurred.";
}

function shouldTriggerWebSearch(userQuery: string, explicitSearchSetting?: boolean | string): boolean {
  if (explicitSearchSetting === false) return false;
  if (explicitSearchSetting === true) return true;
  if (!userQuery || typeof userQuery !== "string") return false;

  const text = userQuery.trim().toLowerCase();
  if (!text) return false;

  // If user provided an explicit URL link in message, enable search/web content processing
  if (/(https?:\/\/[^\s]+)/.test(text)) {
    return true;
  }

  // Common casual greetings, simple pleasantries, acknowledgments - DO NOT trigger web search
  const casualGreetingRegex = /^(hi|hello|hey|hy|hola|sup|yo|greetings|good\s*(morning|afternoon|evening|night)|how\s*are\s*you|how\s*r\s*u|how\s*is\s*it\s*going|whats\s*up|what's\s*up|who\s*are\s*you|what\s*is\s*your\s*name|who\s*made\s*you|who\s*created\s*you|who\s*built\s*you|কেমন\s*আছো|কেমন\s*আছেন|হাই|হ্যালো|হেই|নমস্কার|সালাম|আসসালামু\s*আলাইকুম|assalamu\s*alaikum|তুমি\s*কে|তোমার\s*নাম\s*কি|তোমাকে\s*কে\s*বানিয়েছে|তোমার\s*ডেভেলপার\s*কে|শুভ\s*(সকাল|সন্ধ্যা|রাত্রি)|thanks|thank\s*you|ধন্যবাদ|welcome|স্বাগতম|ok|okay|হাঁ|না|yes|no|sure|fine|great|awesome|bye|goodbye|বিদায়|বিদায়|thx)[!?.\s]*$/i;
  
  if (casualGreetingRegex.test(text)) {
    return false;
  }

  // Pure simple mathematical expressions (e.g. "2+2", "50 * 4")
  if (/^[\d\s+\-*/^().=]+$/.test(text)) {
    return false;
  }

  // Any topic or informational query automatically triggers web search
  // to fetch live grounding sources & images for the Links and Images tabs
  return true;
}

/**
 * Executes high-performance image/vision analysis using xKiro's Qwen models.
 * Prioritizes speed and accuracy for multimodal tasks.
 */
async function callXkiroVision(
  messages: any[],
  temperature: number = 0.7,
  customKey?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  // Validate custom key prefix
  const validatedCustomKey = (customKey && !customKey.startsWith("gsk_")) ? customKey : undefined;
  const dbKey = await getApiKey("xkiro");
  const keysToTry = validatedCustomKey 
    ? [validatedCustomKey] 
    : (dbKey ? [dbKey, ...XKIRO_API_KEYS.filter(k => k !== dbKey)] : XKIRO_API_KEYS);
  let lastErr: any = null;

  if (keysToTry.length === 0) {
    throw new Error("No valid xKiro API keys found. Please check your environment variables.");
  }

  for (const apiKey of keysToTry) {
    const client = new OpenAI({
      baseURL: "https://api.xkiro.com/v1",
      apiKey: apiKey,
      defaultHeaders: {
        "ClientApiKey": apiKey
      }
    });

    // Model fallback chain for xKiro Vision
    const xKiroModels = [
      "qwen/qwen3-vl-plus:free",
      "qwen/qwen3.8-omni-flash",
      "qwen/qwen2.5-vl-72b-instruct",
      "qwen/qwen-vl-plus",
      "qwen/qwen2-vl-7b-instruct"
    ];

    // Convert messages to OpenAI vision format
    const openaiMessages = messages.map(m => {
      const role = (m.role === "assistant" || m.role === "system" || m.role === "user") ? m.role : "user";
      if (Array.isArray(m.content)) {
        return {
          role,
          content: m.content.map((c: any) => {
            if (c.type === "image_url") {
              return {
                type: "image_url",
                image_url: {
                  url: c.image_url.url
                }
              };
            }
            if (c.type === "text") {
              return { type: "text", text: c.text };
            }
            return c;
          })
        };
      }
      return { role, content: typeof m.content === "string" ? m.content : "" };
    });

    for (const model of xKiroModels) {
      try {
        console.log(`[xKiro Vision] Attempting ${model} with key ${apiKey.substring(0, 10)}...`);
        
        if (onChunk) {
          const stream = await client.chat.completions.create({
            model,
            messages: openaiMessages as any,
            temperature,
            max_tokens: 2048,
            stream: true,
          });

          let accumulatedText = "";
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              accumulatedText += content;
              onChunk(content);
            }
          }
          return accumulatedText;
        } else {
          const response = await client.chat.completions.create({
            model,
            messages: openaiMessages as any,
            temperature,
            max_tokens: 2048,
          });
          return response.choices[0].message.content || "";
        }
      } catch (err: any) {
        lastErr = err;
        const msg = err.message || String(err);
        console.warn(`[xKiro Vision] Model ${model} failed:`, msg);
        
        if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("ClientApiKey")) {
          break; // Try next key
        }
      }
    }
    if (!customKey) rotateToNextXkiroKey();
  }
  throw lastErr || new Error("All xKiro Vision models and keys failed.");
}

/**
 * Executes chat, reasoning, writing, or image analysis tasks using xKiro's primary model.
 * Primary Model: qwen/qwen3.5-plus:free (Multimodal, high performance)
 * Fallback: xKiro Vision (Qwen VL)
 */
async function callXkiroPrimary(
  messages: any[],
  temperature: number = 0.7,
  customKey?: string,
  onChunk?: (chunk: string) => void,
  onStatus?: (status: string, tool?: string) => void,
  requestedModel?: string
): Promise<string> {
  // Validate custom key prefix
  const validatedCustomKey = (customKey && !customKey.startsWith("gsk_")) ? customKey : undefined;
  const dbKey = await getApiKey("xkiro");
  const keysToTry = validatedCustomKey 
    ? [validatedCustomKey] 
    : (dbKey ? [dbKey, ...XKIRO_API_KEYS.filter(k => k !== dbKey)] : XKIRO_API_KEYS);
  let lastErr: any = null;

  if (keysToTry.length === 0) {
    throw new Error("No valid xKiro API keys found. Please check your environment variables.");
  }

  for (const apiKey of keysToTry) {
    const client = new OpenAI({
      baseURL: "https://api.xkiro.com/v1",
      apiKey: apiKey,
      defaultHeaders: {
        "ClientApiKey": apiKey
      }
    });

    let primaryModels = [
      "qwen/qwen3.5-plus:free",
      "qwen/qwen2.5-72b-instruct",
      "qwen/qwen2.5-32b-instruct",
      "gpt-4o-mini"
    ];

    if (requestedModel) {
      const lower = requestedModel.toLowerCase();
      if (lower.includes('deepseek')) {
        primaryModels = ["deepseek/deepseek-r1", "deepseek/deepseek-chat", ...primaryModels];
      } else if (lower.includes('qwen')) {
        primaryModels = ["qwen/qwen3.5-plus:free", "qwen/qwen2.5-72b-instruct", ...primaryModels];
      } else if (lower.includes('grok')) {
        primaryModels = ["x-ai/grok-2-1212", "x-ai/grok-beta", ...primaryModels];
      }
    }
    
    // Format messages for OpenAI compatibility
    const openaiMessages = messages.map(m => {
      const role = (m.role === "assistant" || m.role === "system" || m.role === "user") ? m.role : "user";
      if (Array.isArray(m.content)) {
        return {
          role,
          content: m.content.map((c: any) => {
            if (c.type === "image_url") {
              return {
                type: "image_url",
                image_url: { url: c.image_url.url }
              };
            }
            if (c.type === "text") {
              return { type: "text", text: c.text };
            }
            return c;
          })
        };
      }
      return { role, content: typeof m.content === "string" ? m.content : "" };
    });

    for (const model of primaryModels) {
      try {
        console.log(`[xKiro Primary] Attempting ${model} with key ${apiKey.substring(0, 10)}...`);
        if (onStatus) {
          onStatus(process.env.LANGUAGE === 'bn' ? "নেক্সারা এআই (Qwen 3.5) ভাবছে..." : "Nexara AI (Qwen 3.5) is thinking...", "thinking");
        }

        if (onChunk) {
          const stream = await client.chat.completions.create({
            model,
            messages: openaiMessages as any,
            temperature,
            max_tokens: 4096,
            stream: true,
          });

          let accumulatedText = "";
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              accumulatedText += content;
              onChunk(content);
            }
          }
          return accumulatedText;
        } else {
          const response = await client.chat.completions.create({
            model,
            messages: openaiMessages as any,
            temperature,
            max_tokens: 4096,
          });
          return response.choices[0].message.content || "";
        }
      } catch (err: any) {
        lastErr = err;
        const msg = err.message || String(err);
        console.warn(`[xKiro Primary] Model ${model} failed:`, msg);
        
        if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("ClientApiKey")) {
          break; // Try next key
        }
      }
    }
    if (!customKey) rotateToNextXkiroKey();
  }

  throw lastErr || new Error("All xKiro primary models and keys failed.");
}

/**
 * Fallback engine using Google Gemini API (Multimodal, high speed & vision capable)
 */
async function callGeminiFallback(
  messages: any[],
  temperature: number = 0.7,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const geminiKey = await getApiKey("gemini");
  if (!geminiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const client = new OpenAI({
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: geminiKey
  });

  const openaiMessages = messages.map(m => {
    const role = (m.role === "assistant" || m.role === "system" || m.role === "user") ? m.role : "user";
    if (Array.isArray(m.content)) {
      return {
        role,
        content: m.content.map((c: any) => {
          if (c.type === "image_url") {
            return {
              type: "image_url",
              image_url: { url: c.image_url.url }
            };
          }
          if (c.type === "text") {
            return { type: "text", text: c.text };
          }
          return c;
        })
      };
    }
    return { role, content: typeof m.content === "string" ? m.content : "" };
  });

  const models = ["gemini-2.5-flash", "gemini-1.5-flash"];
  let lastErr: any = null;

  for (const model of models) {
    try {
      console.log(`[Gemini Fallback] Attempting ${model}...`);
      if (onChunk) {
        const stream = await client.chat.completions.create({
          model,
          messages: openaiMessages as any,
          temperature,
          max_tokens: 4096,
          stream: true
        });
        let accumulated = "";
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            accumulated += content;
            onChunk(content);
          }
        }
        return accumulated;
      } else {
        const res = await client.chat.completions.create({
          model,
          messages: openaiMessages as any,
          temperature,
          max_tokens: 4096
        });
        return res.choices[0].message.content || "";
      }
    } catch (err: any) {
      lastErr = err;
      console.warn(`[Gemini Fallback] ${model} failed:`, err?.message || err);
    }
  }
  throw lastErr || new Error("All Gemini fallback models failed.");
}

/**
 * Fallback engine using Groq API (Ultra-fast Llama 3 models for text & chat)
 */
async function callGroqFallback(
  messages: any[],
  temperature: number = 0.7,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const groqKey = await getApiKey("groq");
  if (!groqKey) throw new Error("GROQ_API_KEY is not configured.");

  const client = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: groqKey
  });

  const openaiMessages = messages.map(m => {
    const role = (m.role === "assistant" || m.role === "system" || m.role === "user") ? m.role : "user";
    if (Array.isArray(m.content)) {
      const textParts = m.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
      return { role, content: textParts };
    }
    return { role, content: typeof m.content === "string" ? m.content : "" };
  });

  const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  let lastErr: any = null;

  for (const model of models) {
    try {
      console.log(`[Groq Fallback] Attempting ${model}...`);
      if (onChunk) {
        const stream = await client.chat.completions.create({
          model,
          messages: openaiMessages as any,
          temperature,
          max_tokens: 4096,
          stream: true
        });
        let accumulated = "";
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            accumulated += content;
            onChunk(content);
          }
        }
        return accumulated;
      } else {
        const res = await client.chat.completions.create({
          model,
          messages: openaiMessages as any,
          temperature,
          max_tokens: 4096
        });
        return res.choices[0].message.content || "";
      }
    } catch (err: any) {
      lastErr = err;
      console.warn(`[Groq Fallback] ${model} failed:`, err?.message || err);
    }
  }
  throw lastErr || new Error("All Groq fallback models failed.");
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
  res.json({ 
    status: "ok", 
    xkiroConfigured: XKIRO_API_KEYS.length > 0,
    xkiroKeyPoolSize: XKIRO_API_KEYS.length,
    activeXkiroKeyPrefix: getActiveXkiroKey() ? getActiveXkiroKey().substring(0, 8) : "none"
  });
});

app.post("/api/tts", async (req, res) => {
  // Gracefully notify frontend to use high-quality Web Speech API synthesis
  res.json({ fallbackToBrowser: true });
});

async function performWebSearch(query: string, language: string): Promise<{ sources: GroundingSource[], images: SearchImage[], content: string }> {
  const sources: GroundingSource[] = [];
  const images: SearchImage[] = [];
  let aggregatedContent = "WEB SEARCH RESULTS:\n\n";

  let cleanQuery = query.trim().replace(/^search:\s*/i, "");
  // Strip surrounding quotes and quotation marks
  cleanQuery = cleanQuery.replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '').trim();

  // Extract core topic by stripping conversational prefixes/suffixes in Bengali & English
  const searchSubject = cleanQuery
    .replace(/(সম্পর্কে|সম্বন্ধে)\s*(বিস্তারিত|তথ্য|কিছু|সব|বিস্তারিত তথ্য|আলোচনা|ধারণা)?\s*(দাও|বলো|জানাও|লিখ|লিখুন|বলো তো|চাই|কী|কি|কে)?[.?!]*$/i, '')
    .replace(/^(who is|what is|tell me about|information about|details of|details on|tell about|give me information about)\s*/i, '')
    .replace(/\s*(details|information|overview|summary)\s*$/i, '')
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
    .trim() || cleanQuery;

  console.log(`[Web Search] Running multi-source web search for: "${cleanQuery}" (Subject: "${searchSubject}", Lang: ${language})`);

  // 1. Primary Engine: DuckDuckGo HTML Endpoint
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchSubject)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': language === 'bn' ? 'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7' : 'en-US,en;q=0.9'
      }
    });

    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);

      $('.result').slice(0, 10).each((i, el) => {
        const title = $(el).find('.result__title').text().trim();
        const snippet = $(el).find('.result__snippet').text().trim();
        let uri = $(el).find('.result__url').text().trim() || $(el).find('.result__a').attr('href') || '';
        
        if (uri && !uri.startsWith('http')) {
          uri = 'https://' + uri.replace(/^\/\//, '');
        }

        if (title && uri && !uri.includes('duckduckgo.com/y.js')) {
          sources.push({ title, uri });
          aggregatedContent += `[Source ${sources.length}] Title: ${title}\nURL: ${uri}\nSnippet: ${snippet}\n\n`;
        }
      });
    } else {
      console.warn(`[Web Search] DDG HTML returned status ${response.status}`);
    }
  } catch (error: any) {
    console.warn("[Web Search] DDG HTML search error:", error?.message || error);
  }

  // 2. Wikipedia Search Engine: Fallback and Knowledge Grounding (Check both native language and English fallback)
  const wikiLangs = language === 'bn' ? ['bn', 'en'] : ['en'];
  for (const wikiLang of wikiLangs) {
    if (sources.length >= 8 && images.length >= 4) break;
    try {
      const wikiUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchSubject)}&gsrlimit=8&prop=pageimages|extracts&exintro=1&explaintext=1&exsentences=3&pithumbsize=800&format=json&origin=*`;
      const wikiRes = await fetch(wikiUrl);
      
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const pages = wikiData.query?.pages || {};
        
        for (const p of Object.values(pages) as any[]) {
          if (p.thumbnail?.source && images.length < 8) {
            images.push({ url: p.thumbnail.source, sourceTitle: p.title || searchSubject });
          }
          if (sources.length < 8 && p.title) {
            const wikiPageUrl = `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`;
            if (!sources.some(s => s.uri === wikiPageUrl)) {
              sources.push({ title: `${p.title} - Wikipedia`, uri: wikiPageUrl });
              if (p.extract) {
                aggregatedContent += `[Wikipedia Source] ${p.title}: ${p.extract}\nURL: ${wikiPageUrl}\n\n`;
              }
            }
          }
        }
      }
    } catch (wikiError: any) {
      console.warn(`[Web Search] Wikipedia (${wikiLang}) search error:`, wikiError?.message || wikiError);
    }
  }

  // 3. High-Quality Wikimedia Commons Image Search
  if (images.length < 4) {
    try {
      const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchSubject)}&gsrlimit=8&prop=pageimages&pithumbsize=800&format=json&origin=*`;
      const commonsRes = await fetch(commonsUrl);
      if (commonsRes.ok) {
        const cData = await commonsRes.json();
        const cPages = cData.query?.pages || {};
        for (const cp of Object.values(cPages) as any[]) {
          if (cp.thumbnail?.source && images.length < 8) {
            images.push({ url: cp.thumbnail.source, sourceTitle: cp.title?.replace(/^File:/, '') || searchSubject });
          }
        }
      }
    } catch (cErr: any) {
      console.warn("[Web Search] Wikimedia image search error:", cErr?.message || cErr);
    }
  }

  console.log(`[Web Search] Search finished for "${searchSubject}". Found ${sources.length} sources and ${images.length} images.`);
  return { sources, images, content: aggregatedContent };
}

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, language, apiKey, memory, temperature, systemPromptOverride, userInfo, focusMode, model } = req.body;
    
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
    - Nexara AI: [Nexara AI](https://ainexara.com)
    - NOTICED for MrBeast: [NOTICED for MrBeast](https://beast-noticed-bd.lovable.app)
    - Biznuro AI: [Biznuro AI](https://biznuro-ai-bd.vercel.app/)
- Creator Queries Rule: When asked "Who created you?", "Who is your developer?", "Who built you?", "Pretom Biswas", "Pritam Biswas", "কে তোমাকে বানিয়েছে?", "তোমাকে কে তৈরি করেছে?", or any similar query about your creator or developer:
  1. Warmly introduce Pretom Biswas (প্রিতম বিশ্বাস) as a 13-year-old developer from Bangladesh who built Nexara AI out of pure passion for technology and AI.
  2. Naturally mention his other featured projects/apps and provide the clickable Markdown links:
     - [Nexara AI](https://ainexara.com)
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
6. Uncertainty & Honesty Mandate: If you are not 100% certain about a specific date, exact number, or specific name, NEVER state it with absolute confidence or make false assumptions. Express uncertainty honestly in the user's language (e.g., in Bengali: "আমার মনে হয়...", "এই specific তথ্যটা নিয়ে আমি নিশ্চিত না", or in English: "I am not completely certain about this specific date/detail").

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
    let searchSources: GroundingSource[] = [];
    let searchImages: SearchImage[] = [];

    if (enableWebSearch) {
      const searchResult = await performWebSearch(lastUserText, language as string);
      searchSources = searchResult.sources;
      searchImages = searchResult.images;
      if (searchResult.content) {
        systemPrompt.content += `\n\nCRITICAL CONTEXT FROM LIVE WEB SEARCH:\n${searchResult.content}\n\nINSTRUCTION: Use the search results above to provide a factually accurate and up-to-date answer. If search images are available, do not include them in the text markdown unless asked, as they will be shown in a separate tab. Always cite sources if using specific information.`;
      }
    }

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
    let executionEngine = "xkiro-primary";

    if (isStreamingRequested) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      res.write(`data: ${JSON.stringify({ 
        status: language === 'bn' ? "নেক্সারা এআই উত্তর তৈরি করছে (Qwen 3.5)..." : "Nexara AI is generating response (Qwen 3.5)...", 
        tool: hasImage ? "vision" : "thinking",
        sources: searchSources,
        searchImages: searchImages
      })}\n\n`);

      try {
        reply = await callXkiroPrimary(
          finalMessages,
          temperature !== undefined ? temperature : 0.7,
          apiKey,
          (chunk) => {
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          },
          (status, tool) => {
            res.write(`data: ${JSON.stringify({ status, tool })}\n\n`);
          },
          model
        );
      } catch (primaryErr: any) {
        console.warn("[xKiro Primary Error] Falling back:", primaryErr?.message || primaryErr);
        
        let fallbackSucceeded = false;

        if (hasImage) {
          // 1. Try xKiro Vision
          try {
            res.write(`data: ${JSON.stringify({ 
              status: language === 'bn' ? "ছবিটি বিশ্লেষণ করা হচ্ছে (xKiro Vision)..." : "Analyzing photo with xKiro Vision...", 
              tool: "vision" 
            })}\n\n`);

            reply = await callXkiroVision(
              finalMessages,
              temperature !== undefined ? temperature : 0.7,
              apiKey,
              (chunk) => {
                res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
              }
            );
            executionEngine = "xkiro-vision-fallback";
            fallbackSucceeded = true;
          } catch (xKiroVisionErr: any) {
            console.warn("[xKiro Vision Error] Falling back to Gemini:", xKiroVisionErr?.message || xKiroVisionErr);
          }

          // 2. Try Gemini Fallback for Vision
          const geminiVisionKey = await getApiKey("gemini");
          if (!fallbackSucceeded && geminiVisionKey) {
            try {
              res.write(`data: ${JSON.stringify({ 
                status: language === 'bn' ? "ছবিটি বিশ্লেষণ করা হচ্ছে (Gemini Vision)..." : "Analyzing photo with Gemini...", 
                tool: "vision" 
              })}\n\n`);

              reply = await callGeminiFallback(
                finalMessages,
                temperature !== undefined ? temperature : 0.7,
                (chunk) => {
                  res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                }
              );
              executionEngine = "gemini-vision-fallback";
              fallbackSucceeded = true;
            } catch (geminiErr: any) {
              console.error("[Gemini Fallback Error] Gemini Vision failed:", geminiErr?.message || geminiErr);
            }
          }

          if (!fallbackSucceeded) {
            const cleanErr = parseApiError(primaryErr);
            res.write(`data: ${JSON.stringify({ error: cleanErr })}\n\n`);
            return res.end();
          }
        } else {
          // Text-only message: Fallback to Gemini, then Groq
          const geminiTextKey = await getApiKey("gemini");
          if (geminiTextKey) {
            try {
              res.write(`data: ${JSON.stringify({ 
                status: language === 'bn' ? "নেক্সারা এআই উত্তর তৈরি করছে (Gemini)..." : "Generating response (Gemini)...", 
                tool: "thinking" 
              })}\n\n`);

              reply = await callGeminiFallback(
                finalMessages,
                temperature !== undefined ? temperature : 0.7,
                (chunk) => {
                  res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                }
              );
              executionEngine = "gemini-text-fallback";
              fallbackSucceeded = true;
            } catch (geminiErr: any) {
              console.warn("[Gemini Fallback Error]:", geminiErr?.message || geminiErr);
            }
          }

          const groqTextKey = await getApiKey("groq");
          if (!fallbackSucceeded && groqTextKey) {
            try {
              res.write(`data: ${JSON.stringify({ 
                status: language === 'bn' ? "নেক্সারা এআই উত্তর তৈরি করছে (Groq)..." : "Generating response (Groq)...", 
                tool: "thinking" 
              })}\n\n`);

              reply = await callGroqFallback(
                finalMessages,
                temperature !== undefined ? temperature : 0.7,
                (chunk) => {
                  res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                }
              );
              executionEngine = "groq-text-fallback";
              fallbackSucceeded = true;
            } catch (groqErr: any) {
              console.warn("[Groq Fallback Error]:", groqErr?.message || groqErr);
            }
          }

          if (!fallbackSucceeded) {
            const cleanErr = parseApiError(primaryErr);
            res.write(`data: ${JSON.stringify({ error: cleanErr })}\n\n`);
            return res.end();
          }
        }
      }

      if (scrapedImages.length > 0) {
        const imageSources = scrapedImages.map(img => ({ url: img, sourceTitle: "Scraped from URL" }));
        res.write(`data: ${JSON.stringify({ images: imageSources })}\n\n`);
      }

      reply = sanitizeResponseText(reply);
      res.write(`data: ${JSON.stringify({ done: true, reply })}\n\n`);
      return res.end();
    } else {
      // Non-streaming execution
      try {
        reply = await callXkiroPrimary(
          finalMessages,
          temperature !== undefined ? temperature : 0.7,
          apiKey,
          undefined,
          undefined,
          model
        );
      } catch (primaryErr: any) {
        let nonStreamFallbackSuccess = false;
        if (hasImage) {
          try {
            reply = await callXkiroVision(
              finalMessages,
              temperature !== undefined ? temperature : 0.7,
              apiKey
            );
            nonStreamFallbackSuccess = true;
          } catch (xKiroErr: any) {
            const gKey = await getApiKey("gemini");
            if (gKey) {
              try {
                reply = await callGeminiFallback(finalMessages, temperature);
                nonStreamFallbackSuccess = true;
              } catch (gErr: any) {}
            }
          }
        } else {
          const gKey = await getApiKey("gemini");
          if (gKey) {
            try {
              reply = await callGeminiFallback(finalMessages, temperature);
              nonStreamFallbackSuccess = true;
            } catch (gErr: any) {}
          }
          const grKey = await getApiKey("groq");
          if (!nonStreamFallbackSuccess && grKey) {
            try {
              reply = await callGroqFallback(finalMessages, temperature);
              nonStreamFallbackSuccess = true;
            } catch (groqErr: any) {}
          }
        }

        if (!nonStreamFallbackSuccess) {
          throw primaryErr;
        }
      }

      reply = sanitizeResponseText(reply);
      const responseData: any = { reply };
      if (searchSources.length > 0) responseData.sources = searchSources;
      if (searchImages.length > 0) responseData.searchImages = searchImages;
      if (scrapedImages.length > 0) {
        responseData.images = scrapedImages.map(img => ({ url: img, sourceTitle: "Scraped from URL" }));
      }
      return res.json(responseData);
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

    let title = await callXkiroPrimary(promptMessages, 0.3, apiKey);
    
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

// ==========================================
// ADMIN ADVANCED SETTINGS & API KEY MANAGEMENT
// ==========================================

const AUTHORIZED_ADMIN_EMAILS = new Set([
  "ashtosh.biswas.2026@gmail.com",
  "nuxasuff@gmail.com"
]);

async function verifyAdminAuth(req: express.Request): Promise<{ email: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const idToken = authHeader.split("Bearer ")[1]?.trim();
  if (!idToken) return null;

  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) {
      return null;
    }
    const tokenInfo = await res.json();
    if (!tokenInfo || !tokenInfo.email) {
      return null;
    }

    const email = tokenInfo.email.toLowerCase().trim();
    if (AUTHORIZED_ADMIN_EMAILS.has(email)) {
      return { email };
    }

    const envAdmins = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(e => e.trim()).filter(Boolean);
    if (envAdmins.includes(email)) {
      return { email };
    }

    return null;
  } catch (err) {
    console.error("[AdminAuth] Token verification failed:", err);
    return null;
  }
}

// GET /api/admin/keys - Retrieve masked keys and status
app.get("/api/admin/keys", async (req, res) => {
  const admin = await verifyAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized: Verified administrator access required." });
  }

  try {
    const settings = await listMaskedApiSettings();
    return res.json({ 
      settings, 
      adminEmail: admin.email,
      encryptionStandard: "AES-256-GCM"
    });
  } catch (err: any) {
    console.error("[Admin API] Failed to list keys:", err);
    return res.status(500).json({ error: "Failed to load API settings." });
  }
});

// POST /api/admin/keys - Save encrypted API key
app.post("/api/admin/keys", async (req, res) => {
  const admin = await verifyAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized: Verified administrator access required." });
  }

  const { provider, apiKey, status } = req.body;
  if (!provider || typeof provider !== "string") {
    return res.status(400).json({ error: "Provider is required (e.g. groq, xkiro, gemini)." });
  }

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 8) {
    return res.status(400).json({ error: "Invalid API key: must be at least 8 characters long." });
  }

  try {
    const record = await saveApiKeySetting(provider, apiKey.trim(), status || "active");
    return res.json({ 
      success: true, 
      message: `API key for ${provider.toUpperCase()} encrypted with AES-256-GCM and saved successfully.`,
      provider: record.provider,
      status: record.status,
      updated_at: record.updated_at
    });
  } catch (err: any) {
    console.error("[Admin API] Failed to save key:", err);
    return res.status(500).json({ error: "Failed to encrypt and store API key." });
  }
});

// PATCH /api/admin/keys/:provider/status - Update status (active / fallback / inactive)
app.patch("/api/admin/keys/:provider/status", async (req, res) => {
  const admin = await verifyAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized: Verified administrator access required." });
  }

  const { provider } = req.params;
  const { status } = req.body;
  if (!status || !["active", "fallback", "inactive"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'active', 'fallback', or 'inactive'." });
  }

  try {
    const success = await updateApiKeyStatus(provider, status);
    if (!success) {
      return res.status(404).json({ error: `Provider ${provider} not found.` });
    }
    return res.json({ success: true, provider, status });
  } catch (err: any) {
    console.error("[Admin API] Failed to update status:", err);
    return res.status(500).json({ error: "Failed to update status." });
  }
});

// DELETE /api/admin/keys/:provider - Revert to fallback / delete custom key
app.delete("/api/admin/keys/:provider", async (req, res) => {
  const admin = await verifyAdminAuth(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized: Verified administrator access required." });
  }

  const { provider } = req.params;
  try {
    const success = await deleteApiKeySetting(provider);
    return res.json({ 
      success: true, 
      message: `Custom key for ${provider.toUpperCase()} removed. Reverted to environment fallback.` 
    });
  } catch (err: any) {
    console.error("[Admin API] Failed to delete key:", err);
    return res.status(500).json({ error: "Failed to remove key." });
  }
});

// Catch-all route for /api/* to ensure we always return JSON instead of falling back to HTML SPA
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

export default app;
