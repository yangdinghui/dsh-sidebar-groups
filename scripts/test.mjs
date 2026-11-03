#!/usr/bin/env node
/**
 * 在无头 Chrome 里跑 test/harness.html，打印 RESULT 行并以退出码反映结果。
 *
 *   npm test
 *
 * 找不到 Chrome 时用 CHROME_BIN 指定：
 *   CHROME_BIN=/path/to/chrome npm test
 *
 * 退出码：0 = 全部通过，1 = 有失败，2 = 环境问题（找不到 Chrome）。
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

/** 只读地把仓库目录挂到 127.0.0.1 的随机端口上。 */
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const target = normalize(join(root, decodeURIComponent(url.pathname)))
    if (!target.startsWith(root + '/') || !existsSync(target)) {
      response.writeHead(404)
      response.end('not found')
      return
    }
    const body = await readFile(target)
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream' })
    response.end(body)
  } catch (error) {
    response.writeHead(500)
    response.end(String(error))
  }
})

await new Promise((done) => server.listen(0, '127.0.0.1', done))
const { port } = server.address()

const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
if (chrome === undefined) {
  console.error('找不到 Chrome。装一个，或用 CHROME_BIN=/path/to/chrome npm test')
  server.close()
  process.exit(2)
}

let stdout = ''
try {
  ;({ stdout } = await promisify(execFile)(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(root, '.test-profile')}`,
      '--virtual-time-budget=15000',
      '--dump-dom',
      `http://127.0.0.1:${port}/test/harness.html`,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  ))
} catch (error) {
  console.error('Chrome 运行失败：', error.message)
  server.close()
  process.exit(1)
}

server.close()

const match = stdout.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (match === null) {
  console.error('harness 没有产出结果，页面可能没跑起来')
  process.exit(1)
}

const text = match[1]
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&')
const lines = text.split('\n')
const failures = lines.filter((line) => line.startsWith('FAIL'))
for (const failure of failures) console.log(failure)
const result = lines.find((line) => line.startsWith('RESULT:'))
console.log(result ?? text)
process.exit(result?.includes('PASS') === true ? 0 : 1)
