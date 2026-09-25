
import express from "express";
import dotenv from "dotenv";
import * as cheerio from "cheerio";
import OpenAI from "openai";

dotenv.config({ override: true });

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
  const keysToTry = validatedCustomKey ? [validatedCustomKey] : XKIRO_API_KEYS;
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
  const keysToTry = validatedCustomKey ? [validatedCustomKey] : XKIRO_API_KEYS;
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
        tool: hasImage ? "vision" : "thinking" 
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
        console.warn("[xKiro Primary Error] Falling back to vision engine:", primaryErr?.message || primaryErr);
        
        if (hasImage) {
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
          } catch (xKiroVisionErr: any) {
            console.error("[xKiro Vision Fallback Error] xKiro Vision failed:", xKiroVisionErr?.message || xKiroVisionErr);
            const cleanErr = parseApiError(xKiroVisionErr);
            res.write(`data: ${JSON.stringify({ error: cleanErr })}\n\n`);
            return res.end();
          }
        } else {
          const cleanErr = parseApiError(primaryErr);
          res.write(`data: ${JSON.stringify({ error: cleanErr })}\n\n`);
          return res.end();
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
        if (hasImage) {
          try {
            reply = await callXkiroVision(
              finalMessages,
              temperature !== undefined ? temperature : 0.7,
              apiKey
            );
          } catch (xKiroErr: any) {
            throw xKiroErr;
          }
        } else {
          throw primaryErr;
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
      return res.json({ reply });
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

// Catch-all route for /api/* to ensure we always return JSON instead of falling back to HTML SPA
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

export default app;
