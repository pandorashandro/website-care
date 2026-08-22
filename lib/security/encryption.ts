import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH_BYTES = 32
const IV_LENGTH_BYTES = 12
const AUTH_TAG_LENGTH_BYTES = 16
const FORMAT_VERSION = 'v1'

/**
 * Reads and validates WORDPRESS_CREDENTIAL_ENCRYPTION_KEY. Never logged —
 * callers only ever see a generic Error if it's missing or malformed.
 */
function getEncryptionKey(): Buffer {
  const rawKey = process.env.WORDPRESS_CREDENTIAL_ENCRYPTION_KEY

  if (!rawKey) {
    throw new Error('WORDPRESS_CREDENTIAL_ENCRYPTION_KEY is not configured.')
  }

  if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error('WORDPRESS_CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string.')
  }

  const key = Buffer.from(rawKey, 'hex')

  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error('WORDPRESS_CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes.')
  }

  return key
}

/**
 * Encrypts a plaintext credential with AES-256-GCM.
 *
 * Stored format: `v1:<ivBase64>:<authTagBase64>:<ciphertextBase64>`
 * - v1: format version, so the layout can change later without breaking
 *   decryption of existing rows.
 * - iv: 12 fresh random bytes per call (the recommended GCM nonce size) —
 *   never reused, which is what makes encrypting the same plaintext twice
 *   produce different output.
 * - authTag: the 16-byte GCM authentication tag from cipher.final(),
 *   required at decrypt time to detect tampering/corruption.
 * - ciphertext: the encrypted bytes.
 * All three binary components are base64-encoded so the whole value is
 * safe to store as plain text.
 */
export function encryptCredential(value: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH_BYTES)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

/** Decrypts a value produced by encryptCredential. Throws on any malformed or tampered input. */
export function decryptCredential(value: string): string {
  const key = getEncryptionKey()
  const parts = value.split(':')

  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error('Malformed encrypted credential.')
  }

  const [, ivB64, authTagB64, ciphertextB64] = parts

  let iv: Buffer
  let authTag: Buffer
  let ciphertext: Buffer
  try {
    iv = Buffer.from(ivB64, 'base64')
    authTag = Buffer.from(authTagB64, 'base64')
    ciphertext = Buffer.from(ciphertextB64, 'base64')
  } catch {
    throw new Error('Malformed encrypted credential.')
  }

  if (iv.length !== IV_LENGTH_BYTES || authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Malformed encrypted credential.')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return plaintext.toString('utf8')
  } catch {
    throw new Error('Failed to decrypt credential — data may be corrupted or tampered with.')
  }
}
