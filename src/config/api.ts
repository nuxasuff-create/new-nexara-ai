/// <reference types="vite/client" />

// Centralized OpenRouter 4-Key API Registration & Failover Engine Configuration

const RAW_KEYS = [
  import.meta.env.VITE_OPENROUTER_API_KEY_1 || import.meta.env.VITE_OPENROUTER_API_KEY || "",
  import.meta.env.VITE_OPENROUTER_API_KEY_2 || "",
  import.meta.env.VITE_OPENROUTER_API_KEY_3 || "",
  import.meta.env.VITE_OPENROUTER_API_KEY_4 || ""
];

// Filter out empty or unconfigured strings so only valid active keys remain
export const OPENROUTER_API_KEYS = RAW_KEYS.filter(
  (key): key is string => typeof key === 'string' && key.trim().length > 0
);

let currentKeyIndex = 0;

/**
 * Returns the currently active OpenRouter API key from the failover pool.
 */
export function getActiveOpenRouterKey(): string {
  if (OPENROUTER_API_KEYS.length === 0) return "";
  return OPENROUTER_API_KEYS[currentKeyIndex % OPENROUTER_API_KEYS.length];
}

/**
 * Automatically switches to the next available API key in the failover pool upon rate limit / quota detection.
 */
export function rotateOpenRouterKey(): string {
  if (OPENROUTER_API_KEYS.length <= 1) {
    return getActiveOpenRouterKey();
  }
  const prevIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % OPENROUTER_API_KEYS.length;
  console.log(
    `[Nexara Failover Engine] Key #${prevIndex + 1} exhausted. Auto-switching to Key #${currentKeyIndex + 1}...`
  );
  return getActiveOpenRouterKey();
}

