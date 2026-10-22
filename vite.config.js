import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const previewDataStub = fileURLToPath(
  new URL('./src/dev/previewData.prod.js', import.meta.url)
);

/**
 * The visual-QA fixtures are development-only. Redirect their module id while
 * building so the demo library, profiles and activity never reach dist/.
 */
function productionPreviewStub() {
  return {
    name: 'production-preview-stub',
    apply: 'build',
    enforce: 'pre',
    resolveId(source) {
      if (/(^|\/)dev\/previewData$/.test(source)) {
        return previewDataStub;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), productionPreviewStub()],
  server: {
    port: 3000
  }
});
