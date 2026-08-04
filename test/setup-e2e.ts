/**
 * Runs before any module is imported, which is the only place some of this can be set.
 *
 * `config/env.ts` reads `process.env` while the application module graph is being imported, so a
 * spec that assigns to `process.env` in `beforeAll` is already too late — the value is read and
 * validated before the first line of the test body runs.
 */

/**
 * Lift the "media volume nearly full" guard for e2e runs.
 *
 * On macOS `statfs` reports APFS's total capacity against its non-purgeable free space, so a disk
 * that is genuinely 31% used reads as ~89% — past the 0.85 default, and every upload endpoint
 * answers `503 STORAGE_FULL` on a developer machine with plenty of room. The guard itself is
 * covered by unit tests, where the ratio is injected directly.
 *
 * Only a default: an explicit value from the shell still wins, so this can be exercised on purpose.
 */
process.env.CHAT_MEDIA_DISK_FULL_RATIO ??= '0.99';
