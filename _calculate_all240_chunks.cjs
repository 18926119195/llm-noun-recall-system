const fs = require('fs');
const path = require('path');

// 加载数据
const DOCUVERSE_PATH = 'C:\\Users\\Administrator\\Desktop\\docuverse_cartographies_squizoanalythiques_Fe_lix_Guattari_1789114122714.docuverse.json';
const NOUN_INDEX_PATH = path.join(__dirname, 'final-noun-index.json');

console.log('加载数据...');
const docuverse = JSON.parse(fs.readFileSync(DOCUVERSE_PATH, 'utf-8'));
const nounIndex = JSON.parse(fs.readFileSync(NOUN_INDEX_PATH, 'utf-8'));
const recallResult = JSON.parse(fs.readFileSync('noun-recall-results-Z1Q1.json', 'utf-8'))[0];

// 构建chunk映射（与recall-nouns-llm.js一致）
function isRetrievableAtom(chunk) {
  const t = atomSearchText(chunk);
  if (t.length < 4) return false;
  if (chunk.kind === 'fig' && t.length < 24 && !chunk.faces?.text) return false;
  if (chunk.kind === 'fig' && !chunk.faces?.text) {
    const rawNote = (chunk.faces?.fig?.note || '').trim();
    if (/无文字层|未OCR/.test(rawNote)) return false;
  }
  return true;
}

function stripHtmlTags(text) {
  return text.replace(/<[^>]+>/g, '').trim();
}

function stripLatexResidue(text) {
  return text.replace(/\$\$?[^$]*\$?/g, (m) => (m.startsWith('$$') ? '' : m.replace(/\$/g, ''))).trim();
}

function atomSearchText(chunk) {
  const text = chunk.faces?.text?.content?.trim();
  if (text && text.length >= 8) return stripLatexResidue(stripHtmlTags(text));
  const raw = (chunk.content || '').trim();
  if (raw && !raw.startsWith('[FIG:') && raw.length >= 8) return stripLatexResidue(stripHtmlTags(raw));
  if (text) return stripLatexResidue(stripHtmlTags(text));
  const note = (chunk.faces?.fig?.note || '').trim();
  return stripLatexResidue(stripHtmlTags(
    note.replace(/请依据可见版面回答[^。]*。?/g, '').replace(/勿编造未提供的文字[^。]*。?/g, '')
  ));
}

const chunkEntries = [];
let globalOffset = 0;
for (const chunk of docuverse.bookIndex.chunks) {
  if (!isRetrievableAtom(chunk)) continue;
  const text = atomSearchText(chunk).trim();
  if (!text || text.length < 8) continue;
  chunkEntries.push({
    chunkKey: chunk.key,
    page: chunk.page,
    text,
    startOffset: globalOffset,
    endOffset: globalOffset + text.length,
  });
  globalOffset = globalOffset + text.length + 1;
}

console.log('  Chunk总数:', chunkEntries.length);
console.log('  名词总数:', nounIndex.nouns.length);
console.log('');

// 为每个名词构建拓扑链
function offsetToChunk(offset) {
  for (const e of chunkEntries) {
    if (offset >= e.startOffset && offset < e.endOffset) return e;
  }
  return null;
}

function buildNounTopology(nounId) {
  const nounEntry = nounIndex.nouns.find((n) => n.id === nounId);
  if (!nounEntry) return [];
  const bookKeys = new Set();
  for (const { start, end } of nounEntry.offsets) {
    const entry = offsetToChunk(start);
    if (entry) bookKeys.add(entry.chunkKey);
  }
  return [...bookKeys];
}

console.log('计算 Z1-Q1 的chunk数...');
console.log('问题:', recallResult.question);
console.log('='.repeat(80));
console.log('');

// 计算Top 80的chunk数
const top80BookKeys = new Set();
recallResult.recallItems.forEach(item => {
  const bookKeys = buildNounTopology(item.id);
  bookKeys.forEach(bk => top80BookKeys.add(bk));
});

console.log('Top 80 名词:');
console.log('  去重后chunk数:', top80BookKeys.size);
console.log('');

// 计算全部240个名词的chunk数
const all240BookKeys = new Set(top80BookKeys);
recallResult.lowItems.forEach(item => {
  const bookKeys = buildNounTopology(item.id);
  bookKeys.forEach(bk => all240BookKeys.add(bk));
});

console.log('全部 240 个名词:');
console.log('  去重后chunk数:', all240BookKeys.size);
console.log('');

console.log('对比:');
console.log('  Top 80 → ', top80BookKeys.size, 'chunks');
console.log('  全部 240 → ', all240BookKeys.size, 'chunks');
console.log('  增加了:', all240BookKeys.size - top80BookKeys.size, 'chunks');
console.log('');

if (top80BookKeys.size === 204) {
  console.log('✅ 确认: 204 = Top 80 名词的去重chunk数');
} else {
  console.log('⚠️  Top 80 实际chunk数:', top80BookKeys.size);
}
