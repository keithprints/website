import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    // Don't ship sourcemaps to production — they make reverse-engineering
    // the admin bundle trivial. Use 'hidden' if you want maps for ops
    // tooling like Sentry without linking from the JS.
    sourcemap: false,
    rollupOptions: {
      // Multiple entry points — public site at /, admin at /admin.html.
      // The admin bundle never ships to /; vice versa.
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
});
