import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const dist = new URL('../dist/', import.meta.url)
const html = await readFile(new URL('index.html', dist), 'utf8')
const assets = [...html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)=["']([^"']+)["']/gi)]
  .map(([, reference]) => reference)
assert(assets.some(reference => reference.endsWith('.js')), '建置首頁缺少 JavaScript')
assert(assets.some(reference => reference.endsWith('.css')), '建置首頁缺少 CSS')

const vocabularyPath = 'data/toeic_vocabulary.json'
const originalVocabulary = await readFile(new URL('../../toeic_vocabulary.json', import.meta.url))

for (const mount of ['/', '/example-vocabulary-repo/']) {
  const home = new URL(mount, 'https://example.invalid')
  const directRoute = new URL('#/quiz', home)
  assert.equal(directRoute.pathname, home.pathname, '雜湊導覽必須維持同一個伺服器路徑')

  for (const reference of [...assets, vocabularyPath]) {
    const asset = new URL(reference, directRoute)
    assert.equal(asset.origin, home.origin, `${reference} 指向外部網域`)
    assert(asset.pathname.startsWith(mount), `${reference} 脫離部署路徑 ${mount}`)
    const file = await readFile(new URL(asset.pathname.slice(mount.length), dist))
    assert(file.length > 0, `${reference} 缺少檔案內容`)
    if (reference === vocabularyPath) assert.deepEqual(file, originalVocabulary, '建置詞庫與原始資料不一致')
  }
  console.log(`通過 ${mount} 的建置資源與詞庫路徑檢查`)
}
