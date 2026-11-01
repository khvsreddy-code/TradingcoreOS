import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      manifest: true,
      chunkSizeWarningLimit: 350,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replace(/\\/g, '/');

            // Keep the compiler bridge in its own deferred chunk. The actual parser,
            // semantic pipeline and execution work remain in the dedicated module worker;
            // this isolates the browser-side request/validation bridge until Compile/Run.
            if (normalized.endsWith('/src/services/coreSpirit/coreSpiritCompilerClient.ts')) {
              return 'tco-corespirit-compiler';
            }

            // Keep application code under Vite/Rollup's graph-aware splitting. Forcing
            // application modules into global manual chunks can turn a dependency used by
            // one lazy route into an initial dependency of every route that shares its chunk.
            // Route-level React.lazy() and capability-level import() are the boundaries.
            if (!normalized.includes('node_modules')) return undefined;
            if (normalized.includes('react') || normalized.includes('react-dom') || normalized.includes('scheduler') || normalized.includes('motion')) return 'vendor-react';
            if (normalized.includes('@supabase')) return 'vendor-supabase';
            if (normalized.includes('lucide-react')) return 'vendor-icons';
            if (normalized.includes('@zag-js')) return 'vendor-zag';
            // Leave unclassified dependencies to Rollup's graph-aware chunking.
            // A catch-all vendor chunk makes unrelated optional packages share one
            // file, so a single route can download research/AI code it never uses.
          },
        },
      },
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    },
  };
});
