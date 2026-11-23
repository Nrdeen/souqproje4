import fs from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function copyMarketplaceImagesPlugin(): Plugin {
  return {
    name: 'copy-unbundled-src-assets',
    apply: 'build',
    closeBundle(error?: Error): void {
      if (error) {
        return;
      }
      const distDir = path.resolve(import.meta.dirname, 'dist');
      const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
      const distAssets = path.resolve(distDir, 'src/assets');
      if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
        fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      copyMarketplaceImagesPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react/') ||
              id.includes('node_modules/scheduler')
            ) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            if (
              id.includes('node_modules/recharts') ||
              id.includes('node_modules/d3-') ||
              id.includes('node_modules/victory-vendor')
            ) {
              return 'vendor-charts';
            }
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
