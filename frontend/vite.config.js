/** Configure React transforms, local serving, and isolated component tests. */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Load server settings without exposing them to client code.
 * Args:
 *   context: The Vite command's environment mode.
 * Returns:
 *   The React, server, preview, and jsdom test configuration.
 */
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const host = env.HOST || 'localhost';
  const port = Number(env.PORT || 4173);

  return {
    plugins: [react()],
    server: { host, port, strictPort: true },
    preview: { host, port, strictPort: true },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.test.{js,jsx}'],
    },
  };
});
