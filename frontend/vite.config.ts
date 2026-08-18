import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svgr(),
    react({
      jsxRuntime: 'automatic',
      babel: {
        babelrc: false,
        configFile: false,
      },
    })
  ],
  resolve: {
    alias: {
      '@img': path.resolve(__dirname, 'src/assets/img'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3050', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3050', changeOrigin: true, ws: true },
      '/images': { target: 'http://localhost:3050', changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: process.env.NODE_ENV === 'production',
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom'],
        },
      },
    },
  }
})