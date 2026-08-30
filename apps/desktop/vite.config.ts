import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

// Baked build timestamp for 24h trial
const BUILD_TIME = Date.now().toString();

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['better-sqlite3', 'node-thermal-printer', 'bwip-js', 'bcryptjs']
            }
          },
          resolve: {
            alias: {
              '@gestion-veloo/shared': path.resolve(__dirname, '../../packages/shared/src')
            }
          },
          define: {
            'process.env.BUILD_TIME': JSON.stringify(BUILD_TIME)
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  define: {
    '__BUILD_TIME__': JSON.stringify(BUILD_TIME)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@gestion-veloo/shared': path.resolve(__dirname, '../../packages/shared/src')
    }
  },
  server: {
    port: 5174
  }
});
