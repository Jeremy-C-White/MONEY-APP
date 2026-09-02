import { describe, expect, it } from 'vitest';
import {
  buildCloudTaskRequest,
  getAutoSyncConfig,
  getMissingAutoSyncConfig,
  isAuthorizedTaskIdentity,
} from './auto-sync';

const configuredEnvironment = {
  AUTO_SYNC_ENABLED: 'true',
  APP_URL: 'https://finsync.example/',
  CLOUD_TASKS_LOCATION: 'us-central1',
  CLOUD_TASKS_QUEUE: 'finsync-sync',
  CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL: 'finsync-tasks@example.iam.gserviceaccount.com',
};

describe('automatic sync configuration', () => {
  it('uses APP_URL defaults for the worker target and OIDC audience', () => {
    const config = getAutoSyncConfig(configuredEnvironment, 'example-project');

    expect(config).toEqual({
      enabled: true,
      projectId: 'example-project',
      location: 'us-central1',
      queue: 'finsync-sync',
      targetUrl: 'https://finsync.example/api/internal/sync',
      audience: 'https://finsync.example',
      serviceAccountEmail: 'finsync-tasks@example.iam.gserviceaccount.com',
    });
    expect(getMissingAutoSyncConfig(config)).toEqual([]);
  });

  it('reports required fields only when automatic sync is enabled', () => {
    const disabled = getAutoSyncConfig({}, 'example-project');
    expect(getMissingAutoSyncConfig(disabled)).toEqual([]);

    const enabled = getAutoSyncConfig({ AUTO_SYNC_ENABLED: 'true' }, 'example-project');
    expect(getMissingAutoSyncConfig(enabled)).toEqual([
      'location',
      'queue',
      'targetUrl',
      'audience',
      'serviceAccountEmail',
    ]);
  });

  it('builds an authenticated Cloud Tasks HTTP request', () => {
    const config = getAutoSyncConfig(configuredEnvironment, 'example-project');
    const request = buildCloudTaskRequest(config, { uid: 'user-1', itemId: 'item-1' });

    expect(request.parent).toBe('projects/example-project/locations/us-central1/queues/finsync-sync');
    expect(request.task.dispatchDeadline).toBe('1800s');
    expect(request.task.httpRequest.url).toBe('https://finsync.example/api/internal/sync');
    expect(request.task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: 'finsync-tasks@example.iam.gserviceaccount.com',
      audience: 'https://finsync.example',
    });
    expect(JSON.parse(Buffer.from(request.task.httpRequest.body, 'base64').toString('utf8'))).toEqual({
      uid: 'user-1',
      item_id: 'item-1',
    });
  });

  it('requires the configured verified service-account identity', () => {
    expect(isAuthorizedTaskIdentity({
      email: 'finsync-tasks@example.iam.gserviceaccount.com',
      email_verified: true,
    }, 'finsync-tasks@example.iam.gserviceaccount.com')).toBe(true);

    expect(isAuthorizedTaskIdentity({
      email: 'attacker@example.com',
      email_verified: true,
    }, 'finsync-tasks@example.iam.gserviceaccount.com')).toBe(false);
    expect(isAuthorizedTaskIdentity({
      email: 'finsync-tasks@example.iam.gserviceaccount.com',
      email_verified: false,
    }, 'finsync-tasks@example.iam.gserviceaccount.com')).toBe(false);
  });
});
