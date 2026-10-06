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

            // Application-shell boundaries. These modules are intentionally isolated from
            // the landing shell and from each other so the first chart render does not pay
            // for the live terminal implementation.
            if (normalized.includes('/src/LiveTradingWorkspace.tsx')) return 'tco-live-workspace';
            if (normalized.includes('/src/CoreSpiritVelaEngine.ts')) return 'tco-corespirit-engine';
            if (normalized.includes('/src/services/core/chart/')) return 'tco-live-chart';
            if (normalized.includes('/src/TcoVelaDataProvider.ts')) return 'tco-live-data';

            // Keep the generic authenticated broker/runtime plane separate from Vela itself.
            if (normalized.includes('/src/services/runtime/')) return 'tco-runtime';

            // Compiler-heavy CoreSpirit modules are shared by authoring and the lazy chart
            // engine, but never imported by the landing shell or ordinary workspace modules
            // unless one of those capabilities explicitly activates them.
            const coreSpiritCompilerFiles = [
              '/src/services/coreSpirit/coreSpiritPipeline.ts',
              '/src/services/coreSpirit/compiler.ts',
              '/src/services/coreSpirit/parser.ts',
              '/src/services/coreSpirit/lexer.ts',
              '/src/services/coreSpirit/semanticAnalyzer.ts',
              '/src/services/coreSpirit/semanticGraph.ts',
              '/src/services/coreSpirit/standardLibrary.ts',
              '/src/services/coreSpirit/standardLibraryNamespaces.ts',
              '/src/services/coreSpirit/surfaceForms.ts',
              '/src/services/coreSpirit/syntax.ts',
              '/src/services/coreSpirit/optimizer.ts',
              '/src/services/coreSpirit/coreSpiritComponents.ts',
              '/src/services/coreSpirit/coreSpiritExecutionModel.ts',
              '/src/services/coreSpirit/ir.ts',
              '/src/services/coreSpirit/types.ts',
              '/src/services/coreSpirit/artifact.ts',
              '/src/services/coreSpirit/runtime.ts',
              '/src/services/coreSpirit/executionVM.ts',
            ];
            if (coreSpiritCompilerFiles.some((fragment) => normalized.endsWith(fragment))) {
              return 'tco-corespirit-compiler';
            }

            if (!normalized.includes('node_modules')) return undefined;
            if (normalized.includes('react') || normalized.includes('react-dom') || normalized.includes('scheduler') || normalized.includes('motion')) return 'vendor-react';
            if (normalized.includes('@supabase')) return 'vendor-supabase';
            if (normalized.includes('lucide-react')) return 'vendor-icons';
            if (normalized.includes('@zag-js')) return 'vendor-zag';
            return 'vendor-other';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
