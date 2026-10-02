import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Optional licensed assets: only emit URLs for files that actually exist.
function superiorStyles() {
  const faces = [['regular', 400], ['medium', 500], ['semibold', 600]]
  return faces.filter(([name]) => existsSync(path.join(process.cwd(), 'public', 'fonts', `lt-superior-${name}.woff2`)))
    .map(([name, weight]) => `@font-face{font-family:'LT Superior';src:url('/fonts/lt-superior-${name}.woff2') format('woff2');font-style:normal;font-weight:${weight};font-display:swap}`).join('')
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  // A development .env must never ship React's development runtime in a build.
  define: { 'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development') },
  plugins: [react(), { name: 'trusted-preview-origin', transformIndexHtml(html) {
    const origin = command === 'serve' ? loadEnv(mode, process.cwd(), 'APP_ORIGIN').APP_ORIGIN || 'http://localhost:5173'
      : process.env.APP_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    const page = origin ? html.replaceAll('__APP_ORIGIN__', new URL(origin).origin) : html
    const fonts = superiorStyles()
    return fonts ? page.replace('</head>', `<style>${fonts}</style></head>`) : page
  } }],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
}))
