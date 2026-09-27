import crypto from "crypto";

// Fallback master key for local development if not set in environment
const DEFAULT_DEV_MASTER_KEY = "nexara_master_encryption_key_2026_super_secure_vault_32bytes";

/**
 * Returns a 32-byte Buffer derived from ENCRYPTION_MASTER_KEY
 */
export function getMasterKeyBuffer(): Buffer {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY || DEFAULT_DEV_MASTER_KEY;
  // Use SHA-256 to ensure exact 32 bytes (256-bit key) for AES-256-GCM
  return crypto.createHash("sha256").update(masterKey).digest();
}

/**
 * Encrypts a plain-text API key using AES-256-GCM
 * Returns a colon-delimited string: "iv:authTag:ciphertext"
 */
export function encryptApiKey(plainKey: string): string {
  if (!plainKey || typeof plainKey !== "string") {
    throw new Error("Invalid key: must be a non-empty string");
  }

  const iv = crypto.randomBytes(12); // 96-bit IV standard for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", getMasterKeyBuffer(), iv);
  
  let encrypted = cipher.update(plainKey.trim(), "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM payload ("iv:authTag:ciphertext") back to plain text
 */
export function decryptApiKey(encryptedPayload: string): string {
  if (!encryptedPayload || typeof encryptedPayload !== "string") {
    throw new Error("Invalid encrypted payload");
  }

  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted payload format. Expected 'iv:tag:ciphertext'");
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", getMasterKeyBuffer(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generates a masked display version of an API key
 * e.g., "gsk_••••••••••••••••C4hz"
 */
export function maskApiKey(key: string): string {
  if (!key) return "••••••••";
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }
  
  // Show prefix (first 3-4 chars) and suffix (last 4 chars)
  const prefixLen = trimmed.startsWith("gsk_") ? 4 : (trimmed.startsWith("sk-") ? 3 : 4);
  const prefix = trimmed.substring(0, prefixLen);
  const suffix = trimmed.substring(trimmed.length - 4);
  
  return `${prefix}${"•".repeat(12)}${suffix}`;
}
