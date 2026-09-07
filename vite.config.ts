import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {execFileSync} from 'node:child_process';
import {defineConfig} from 'vite';

function buildCommitSha(): string {
  const fromEnvironment = [
    process.env.APP_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.COMMIT_SHA,
  ].find(value => typeof value === 'string' && /^[a-f0-9]{7,40}$/i.test(value.trim()));
  if (fromEnvironment) return fromEnvironment.trim().toLowerCase();

  // This runs while Vite builds, never in the deployed container. App Hosting
  // may not expose its Cloud Build commit substitution as an environment
  // variable, so use source metadata when it is present and fail explicitly
  // when neither source is available.
  try {
    const fromGit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[a-f0-9]{40}$/i.test(fromGit) ? fromGit.toLowerCase() : '';
  } catch {
    return '';
  }
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_COMMIT_SHA__: JSON.stringify(buildCommitSha()),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
