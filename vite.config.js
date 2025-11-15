import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: 'all_emoji',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 8004,
    host: true,
    allowedHosts: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://118.70.128.4:8005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/robot': {
        target: 'https://cotangential-angle-clannishly.ngrok-free.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/robot/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('ngrok-skip-browser-warning', 'true');
          });
        }
      }
    }
  }
});
