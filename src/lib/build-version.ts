export function normalizeBuildCommit(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{7,40}$/.test(normalized) ? normalized : null;
}

export function shortBuildCommit(value: string | null): string {
  return value ? value.slice(0, 7) : 'Unavailable';
}

export const BUILD_COMMIT_SHA = normalizeBuildCommit(__APP_COMMIT_SHA__);
