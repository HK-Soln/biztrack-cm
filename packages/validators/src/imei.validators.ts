/**
 * Serial-number validation for serialised inventory (Phase 3G). The rule lives in
 * @biztrack/domain (catalog-rules) so the server, its sync path and the till all apply
 * the same one; this module re-exports it for existing importers.
 */
export { validateImei, validateSerialNumber, type SerialType } from '@biztrack/domain'
