export const STATUS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function shouldRefreshStatus(
  lastAttemptAt: number | null,
  now: number,
  isVisible: boolean
): boolean {
  if (!isVisible) return false;
  if (lastAttemptAt === null) return true;
  return now - lastAttemptAt >= STATUS_REFRESH_INTERVAL_MS;
}
