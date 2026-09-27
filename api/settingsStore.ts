import fs from "fs";
import path from "path";
import { encryptApiKey, decryptApiKey, maskApiKey } from "./crypto.js";

export type ApiProvider = "groq" | "xkiro" | "gemini" | string;
export type KeyStatus = "active" | "fallback" | "inactive";

export interface ApiSettingRecord {
  provider: ApiProvider;
  encrypted_key: string;
  status: KeyStatus;
  updated_at: string;
}

export interface MaskedApiSetting {
  provider: ApiProvider;
  masked_key: string;
  status: KeyStatus;
  has_custom_key: boolean;
  is_env_fallback: boolean;
  updated_at: string;
}

// In-Memory Key Cache with 5-minute TTL
interface CachedKey {
  key: string;
  expiresAt: number;
}

const keyCache = new Map<string, CachedKey>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Local data file path
const DATA_DIR = path.resolve(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "api_settings.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.warn("[SettingsStore] Failed to create data dir:", e);
    }
  }
}

/**
 * Reads all records from persistent storage
 */
async function loadAllRecords(): Promise<Record<string, ApiSettingRecord>> {
  // 1. Check if Vercel KV / Upstash is configured
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const res = await fetch(`${process.env.KV_REST_API_URL}/get/api_settings_vault`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.result) {
          const parsed = typeof json.result === "string" ? JSON.parse(json.result) : json.result;
          return parsed || {};
        }
      }
    } catch (err) {
      console.warn("[SettingsStore] Vercel KV read error, falling back to local file:", err);
    }
  }

  // 2. Read from local persistent file
  try {
    ensureDataDir();
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn("[SettingsStore] Local file read error:", err);
  }

  return {};
}

/**
 * Saves all records to persistent storage
 */
async function saveAllRecords(records: Record<string, ApiSettingRecord>): Promise<void> {
  // 1. Save to Vercel KV / Upstash if configured
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      await fetch(`${process.env.KV_REST_API_URL}/set/api_settings_vault`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(records)
      });
    } catch (err) {
      console.warn("[SettingsStore] Vercel KV write error:", err);
    }
  }

  // 2. Save to local persistent file
  try {
    ensureDataDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(records, null, 2), "utf8");
  } catch (err) {
    console.warn("[SettingsStore] Local file write error:", err);
  }
}

/**
 * Saves or updates an API key for a provider (encodes with AES-256-GCM)
 */
export async function saveApiKeySetting(
  provider: ApiProvider,
  plainKey: string,
  status: KeyStatus = "active"
): Promise<ApiSettingRecord> {
  const normProvider = provider.toLowerCase().trim();
  const encrypted = encryptApiKey(plainKey);

  const records = await loadAllRecords();
  const record: ApiSettingRecord = {
    provider: normProvider,
    encrypted_key: encrypted,
    status,
    updated_at: new Date().toISOString()
  };

  records[normProvider] = record;
  await saveAllRecords(records);

  // Invalidate in-memory cache immediately so new key takes effect
  keyCache.delete(normProvider);
  console.log(`[SettingsStore] Encrypted API key saved for provider: ${normProvider} (Status: ${status})`);

  return record;
}

/**
 * Updates status of an existing provider key (e.g. active -> inactive)
 */
export async function updateApiKeyStatus(
  provider: ApiProvider,
  status: KeyStatus
): Promise<boolean> {
  const normProvider = provider.toLowerCase().trim();
  const records = await loadAllRecords();
  if (!records[normProvider]) return false;

  records[normProvider].status = status;
  records[normProvider].updated_at = new Date().toISOString();
  await saveAllRecords(records);

  keyCache.delete(normProvider);
  return true;
}

/**
 * Deletes a provider's custom key from settings
 */
export async function deleteApiKeySetting(provider: ApiProvider): Promise<boolean> {
  const normProvider = provider.toLowerCase().trim();
  const records = await loadAllRecords();
  if (!records[normProvider]) return false;

  delete records[normProvider];
  await saveAllRecords(records);

  keyCache.delete(normProvider);
  return true;
}

/**
 * Lists all provider settings with masked keys (safe for admin UI)
 */
export async function listMaskedApiSettings(): Promise<MaskedApiSetting[]> {
  const records = await loadAllRecords();
  const standardProviders = ["xkiro", "gemini", "groq"];
  const allProviderKeys = Array.from(new Set([...standardProviders, ...Object.keys(records)]));

  const result: MaskedApiSetting[] = [];

  for (const provider of allProviderKeys) {
    const record = records[provider];
    let masked = "";
    let hasCustomKey = false;
    let isEnvFallback = false;
    let status: KeyStatus = record?.status || "fallback";

    if (record && record.encrypted_key && record.status !== "inactive") {
      try {
        const decrypted = decryptApiKey(record.encrypted_key);
        masked = maskApiKey(decrypted);
        hasCustomKey = true;
      } catch (e) {
        masked = "••••[Decryption Error]";
      }
    }

    if (!hasCustomKey) {
      // Check environment variable fallback
      let envKey = "";
      if (provider === "groq") envKey = process.env.GROQ_API_KEY || "";
      else if (provider === "gemini") envKey = process.env.GEMINI_API_KEY || "";
      else if (provider === "xkiro") envKey = process.env.XKIRO_API_KEY || process.env.XKIRO_API_KEY_1 || "";

      if (envKey) {
        masked = maskApiKey(envKey);
        isEnvFallback = true;
        if (!record) status = "fallback";
      } else {
        masked = "Not configured";
        if (!record) status = "inactive";
      }
    }

    result.push({
      provider,
      masked_key: masked,
      status,
      has_custom_key: hasCustomKey,
      is_env_fallback: isEnvFallback,
      updated_at: record?.updated_at || new Date().toISOString()
    });
  }

  return result;
}

/**
 * Resolves the active decrypted key for a provider with in-memory caching and fallback to .env
 * This function runs ONLY on the server side.
 */
export async function getApiKey(provider: ApiProvider): Promise<string | null> {
  const normProvider = provider.toLowerCase().trim();

  // 1. Check in-memory cache
  const cached = keyCache.get(normProvider);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  // 2. Check Database / Store
  const records = await loadAllRecords();
  const record = records[normProvider];

  if (record && record.status === "active" && record.encrypted_key) {
    try {
      const decrypted = decryptApiKey(record.encrypted_key);
      if (decrypted && decrypted.trim().length > 0) {
        keyCache.set(normProvider, {
          key: decrypted.trim(),
          expiresAt: Date.now() + CACHE_TTL_MS
        });
        return decrypted.trim();
      }
    } catch (err) {
      console.error(`[SettingsStore] Decryption failed for ${normProvider}:`, err);
    }
  }

  // 3. Fallback to process.env
  let envKey: string | null = null;
  if (normProvider === "groq") {
    envKey = process.env.GROQ_API_KEY || null;
  } else if (normProvider === "gemini") {
    envKey = process.env.GEMINI_API_KEY || null;
  } else if (normProvider === "xkiro") {
    envKey = process.env.XKIRO_API_KEY || process.env.XKIRO_API_KEY_1 || null;
  }

  if (envKey && envKey.trim().length > 0) {
    keyCache.set(normProvider, {
      key: envKey.trim(),
      expiresAt: Date.now() + CACHE_TTL_MS
    });
    return envKey.trim();
  }

  return null;
}
