export type AutoSyncConfig = {
  enabled: boolean;
  projectId: string;
  location: string;
  queue: string;
  targetUrl: string;
  audience: string;
  serviceAccountEmail: string;
};

type AutoSyncEnvironment = Record<string, string | undefined>;

export function getAutoSyncConfig(
  env: AutoSyncEnvironment,
  defaultProjectId: string
): AutoSyncConfig {
  const appUrl = (env.APP_URL || '').replace(/\/$/, '');
  const targetUrl = env.CLOUD_TASKS_TARGET_URL || (appUrl ? `${appUrl}/api/internal/sync` : '');

  return {
    enabled: env.AUTO_SYNC_ENABLED === 'true',
    projectId: env.CLOUD_TASKS_PROJECT_ID || defaultProjectId,
    location: env.CLOUD_TASKS_LOCATION || '',
    queue: env.CLOUD_TASKS_QUEUE || '',
    targetUrl,
    audience: env.CLOUD_TASKS_OIDC_AUDIENCE || appUrl,
    serviceAccountEmail: env.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL || '',
  };
}

export function getMissingAutoSyncConfig(config: AutoSyncConfig): string[] {
  if (!config.enabled) return [];

  return (['projectId', 'location', 'queue', 'targetUrl', 'audience', 'serviceAccountEmail'] as const)
    .filter(field => !config[field]);
}

export function buildCloudTaskRequest(
  config: AutoSyncConfig,
  payload: { uid: string; itemId: string }
) {
  const body = Buffer.from(JSON.stringify({
    uid: payload.uid,
    item_id: payload.itemId,
  })).toString('base64');

  return {
    parent: `projects/${config.projectId}/locations/${config.location}/queues/${config.queue}`,
    task: {
      dispatchDeadline: '1800s',
      httpRequest: {
        httpMethod: 'POST',
        url: config.targetUrl,
        headers: { 'Content-Type': 'application/json' },
        body,
        oidcToken: {
          serviceAccountEmail: config.serviceAccountEmail,
          audience: config.audience,
        },
      },
    },
  };
}

export function isAuthorizedTaskIdentity(
  tokenPayload: Record<string, unknown> | undefined,
  serviceAccountEmail: string
): boolean {
  if (!tokenPayload || !serviceAccountEmail) return false;
  return tokenPayload.email === serviceAccountEmail && tokenPayload.email_verified === true;
}
