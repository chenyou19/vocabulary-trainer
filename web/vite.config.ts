import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'

const source = new URL('../toeic_vocabulary.json', import.meta.url)
const vocabularyPath = 'data/toeic_vocabulary.json'

function vocabularyAsset(): Plugin {
  return {
    name: 'project-vocabulary',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== `/${vocabularyPath}`) return next()
        const stream = createReadStream(source)
        stream.on('error', () => {
          response.statusCode = 404
          response.end('找不到專案詞庫。')
        })
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        stream.pipe(response)
      })
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: vocabularyPath, source: await readFile(source) })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), vocabularyAsset()],
  server: {
    watch: { ignored: ['**/.pnpm-store/**'] },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
})
