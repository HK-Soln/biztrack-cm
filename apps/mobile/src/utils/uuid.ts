/**
 * uuid.ts
 *
 * Cross-platform UUID generator for React Native / Expo.
 *
 * crypto.randomUUID() is NOT available on Hermes (even in Expo SDK 55+).
 * We use expo-crypto which provides a native-backed secure implementation
 * that works correctly on iOS, Android and Web.
 *
 * Usage:
 *   import { generateUUID } from '@/utils/uuid'
 *   const id = generateUUID()
 */
import * as Crypto from 'expo-crypto'

export function generateUUID(): string {
  return Crypto.randomUUID()
}
