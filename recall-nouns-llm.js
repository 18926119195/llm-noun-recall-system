/**
 * 基于词表拓扑链的召回引擎（两步粗筛 + 精打分架构）
 *
 * 流程：
 * 1. 粗筛（LLM 1 轮）：快速判断"是否相关"，每批输入【【1】】词语，只回【【N】】列表或 NONE，约 1-2 tokens 输出
 * 2. 精打（LLM 2 轮）：只对粗筛 YES 的词打分，每批输入【【1】】词语，只回【【{"i":"【【N】】","score":分数}】】格式
 * 3. 高分词 → 构建拓扑链 → 召回原文
 *
 * 所有 LLM 输入/输出均为【【N】】机器符号，不含偏移量。
 * 解析后立即映射回原始 noun entry（含 offsets）。
 *
 * 用法：
 *   node recall-nouns-llm.js                            # 所有问题
 *   node recall-nouns-llm.js Z1-Q1 Z1-Q2              # 指定问题ID
 *   NOUN_BATCH_SIZE=500 node recall-nouns-llm.js       # 粗筛批次大小（默认500）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============ 配置（环境变量覆盖）============
const DOCUVERSE_PATH = process.env.DOCUVERSE_PATH || 'C:\\Users\\Administrator\\Desktop\\docuverse_cartographies_squizoanalythiques_Fe_lix_Guattari_1789114122714.docuverse.json';
const NOUN_INDEX_PATH = process.env.NOUN_INDEX_PATH || path.join(__dirname, 'final-noun-index.json');
const QUESTIONS_PATH = process.env.QUESTIONS_PATH || path.join(__dirname, 'test-questions.json');
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(__dirname, 'noun-recall-results.json');

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
const API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
const BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.LLM_MODEL || 'deepseek-flash';
const CONCURRENCY = parseInt(process.env.LLM_CONCURRENCY || '8', 10);
const COARSE_BATCH_SIZE = parseInt(process.env.NOUN_BATCH_SIZE || '500', 10); // 粗筛批次大小（越大 token 越省但越粗）
const SCORE_BATCH_SIZE = parseInt(process.env.SCORE_BATCH_SIZE || '80', 10); // 精打批次大小
const TOP_N = parseInt(process.env.TOP_N || '100', 10);
const TOPOLOGY_WINDOW = parseInt(process.env.TOPOLOGY_WINDOW || '5', 10);
const QUESTION_IDS = (process.env.QUESTION_IDS || '').split(',').filter(Boolean);

if (!API_KEY) {
  console.error('缺少 API 密钥，设置 LLM_API_KEY 环境变量');
  process.exit(1);
}

// ============ 加载数据 ============
console.log('加载数据...');
const docuverse = JSON.parse(fs.readFileSync(DOCUVERSE_PATH, 'utf-8'));
const nounIndex = JSON.parse(fs.readFileSync(NOUN_INDEX_PATH, 'utf-8'));
const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));

// 构建 chunk 偏移表（与 extract-nouns-unified.js 的 buildChunkEntries 一致）
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
  globalOffset = globalOffset + text.length + 1; // +1 为分隔符
}
const totalTextLen = globalOffset;
console.log(`  文档总长度: ${totalTextLen} 字符, chunk 数: ${chunkEntries.length}`);
console.log(`  名词数: ${nounIndex.nouns.length}, 问题数: ${questions.length}`);

// ============ 辅助函数 ============
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

/**
 * 二分查找：将字符偏移映射到 chunk 条目
 */
function offsetToChunk(offset) {
  let lo = 0, hi = chunkEntries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const e = chunkEntries[mid];
    if (offset < e.startOffset) hi = mid - 1;
    else if (offset >= e.endOffset) lo = mid + 1;
    else return e;
  }
  return null;
}

/**
 * 在原始文本中取名词的上下文窗口
 */
function getNounContext(nounEntry, window = TOPOLOGY_WINDOW) {
  const results = [];
  const fullText = null; // 延迟获取，按需拼接
  for (const { start, end } of nounEntry.offsets) {
    const entry = offsetToChunk(start);
    if (!entry) {
      // 不在任何 chunk 内，尝试直接查找
      results.push({
        start,
        end,
        text: null,
        chunkKey: null,
        page: null,
        neighbors: [],
        raw: `offset:${start}-${end}`,
      });
      continue;
    }
    // 取 chunk 内相对偏移的上下文
    const relStart = start - entry.startOffset;
    const relEnd = end - entry.startOffset;
    const before = entry.text.slice(Math.max(0, relStart - window * 10), relStart);
    const after = entry.text.slice(relEnd, Math.min(entry.text.length, relEnd + window * 10));
    const beforeWords = before.split(/[\s\n.,;:!?]+/).filter((w) => w.length > 1).slice(-window);
    const afterWords = after.split(/[\s\n.,;:!?]+/).filter((w) => w.length > 1).slice(0, window);
    results.push({
      start,
      end,
      chunkKey: entry.chunkKey,
      page: entry.page,
      neighbors: [...beforeWords, ...afterWords],
    });
  }
  return results;
}

/**
 * 基于名词表构建全局拓扑链（全局名词 → 位置 → 相邻词）
 */
function buildGlobalTopology(nounSurfaceSet) {
  const surfaceToNoun = new Map();
  for (const n of nounIndex.nouns) {
    surfaceToNoun.set(n.surface.toLowerCase(), n);
  }
  const result = new Map();
  for (const entry of chunkEntries) {
    const words = entry.text.split(/[\s\n.,;:!?]+/).filter((w) => w.length > 1);
    const indices = [];
    // 找出这批词中哪些是名词表中的词
    for (let i = 0; i < words.length; i++) {
      if (surfaceToNoun.has(words[i].toLowerCase())) {
        indices.push(i);
      }
    }
    // 构建相邻关系
    for (const ni of indices) {
      const w = words[ni];
      const noun = surfaceToNoun.get(w.toLowerCase());
      if (!result.has(noun.id)) {
        result.set(noun.id, []);
      }
      const neighbors = [];
      for (let j = Math.max(0, ni - TOPOLOGY_WINDOW); j < ni; j++) neighbors.push(words[j]);
      for (let j = ni + 1; j < Math.min(words.length, ni + TOPOLOGY_WINDOW + 1); j++) neighbors.push(words[j]);
      result.get(noun.id).push({
        chunkKey: entry.chunkKey,
        page: entry.page,
        offset: entry.startOffset + entry.text.indexOf(w),
        neighbors: [...new Set(neighbors)],
      });
    }
  }
  return result;
}

// ============ LLM 调用 ============
async function callLLM(prompt, retryCount = 0, maxTokens = 1024) {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 2000;
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (response.status === 429 && retryCount < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BASE_DELAY * Math.pow(2, retryCount)));
      return callLLM(prompt, retryCount + 1, maxTokens);
    }
    if (!response.ok) throw new Error(`OpenAI API ${response.status}`);
    const data = await response.json();
    const text = data.choices[0]?.message?.content || '';
    const finishReason = data.choices[0]?.finish_reason || '';
    return { text, usage: data.usage || null, truncated: finishReason === 'length' };
  } catch (err) {
    if (retryCount < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BASE_DELAY * Math.pow(2, retryCount)));
      return callLLM(prompt, retryCount + 1, maxTokens);
    }
    console.error('LLM调用失败:', err.message);
    return null;
  }
}

// ============ Prompt 构建 ============

/**
 * 粗筛 prompt：LLM 输入只有【【N】】词语列表，输出也只有【【N】】列表或 NONE
 */
function buildCoarsePrompt(question, batchWords) {
  const list = batchWords.map((w, i) => `【【${i + 1}】】${w}`).join('\n');
  return `问题: ${question}

从下列名词中，选出所有对回答这个问题可能有帮助的词。只回答相关词的机器符号（用 | 分隔），例如：|【【1】|【【5】|【【17】|
如果没有任何相关词，回答：NONE

词语列表：
${list}

相关词编号：`;
}

/**
 * 精打 prompt：LLM 输入只有【【N】】词语列表，输出也只有【【{"i":"【【N】】","score":分数}】】格式
 */
function buildScorePrompt(question, yesNounSurfaces) {
  const list = yesNounSurfaces.map((w, i) => `【【${i + 1}】】${w}`).join('\n');
  return `问题: ${question}

以下是你选中的相关词，请按重要程度打分（1-100）：
  1-30   弱相关：领域相关但非核心，仅提及
  31-60  中等相关：对答案有一定贡献
  61-80  强相关：重要概念，显著影响答案质量
  81-100 核心概念：没有它就无法准确回答

词语列表：
${list}

只输出 JSON 数组（用【【N】】引用词语），只包含你选中的词，例如：
【【{"i":"【【1】】","score":95},{"i":"【【3】】","score":72}】】

如果这批里没有任何相关词，输出【【】】。`;
}

// ============ 解析函数（容错，宽松匹配）=============

/**
 * 解析粗筛输出：提取所有【【N】】符号，映射回批次内的索引
 * 宽容：不要求 JSON，不要求完整格式，只要包含【【数字】】即可
 */
function parseCoarseResult(rawText, batchSize) {
  if (!rawText || typeof rawText !== 'string') return [];
  const text = rawText.trim();
  if (/^none$/i.test(text)) return [];

  // 宽松匹配【【数字】】或【数字】（LLM 经常漏写一层括号）
  const indices = [];
  const matches = text.matchAll(/【+(\d+)】+/g);
  for (const m of matches) {
    const idx = parseInt(m[1], 10) - 1; // 转为 0-based
    if (idx >= 0 && idx < batchSize) indices.push(idx);
  }
  return [...new Set(indices)]; // 去重
}

/**
 * 解析精打输出：提取【【{"i":"【【N】】","score":数字}】】格式
 * 宽松两段策略：
 * 1. 提取所有【【数字】】（机器符号索引）
 * 2. 提取所有 1-100 的数字（候选分数）
 * 3. 按出现顺序一一配对，去重（同索引保留最高分）
 * 适用于 LLM 输出格式随意、含额外文字、嵌套 JSON 等情况
 */
function parseScoreResult(rawText, batchSize) {
  if (!rawText || typeof rawText !== 'string') return [];
  const text = rawText.trim();
  if (/^【【\s*\】\s*】$/.test(text)) return []; // 【【】】= 空

  // 提取所有机器符号索引
  const indices = [];
  for (const m of text.matchAll(/【【(\d+)】】/g)) {
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < batchSize) indices.push(idx);
  }

  // 提取所有 1-100 的整数（候选分数），排除机器符号本身编号
  const allNumbers = [];
  for (const m of text.matchAll(/(?<![【【\d])(\d{1,3})(?!\d|\】】)/g)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 100) allNumbers.push(n);
  }

  // 按顺序一一配对（去重：同索引保留最高分）
  const scoreMap = new Map();
  const minLen = Math.min(indices.length, allNumbers.length);
  for (let i = 0; i < minLen; i++) {
    const idx = indices[i];
    const score = allNumbers[i];
    if (!scoreMap.has(idx) || scoreMap.get(idx) < score) {
      scoreMap.set(idx, score);
    }
  }

  return [...scoreMap.entries()].map(([index, score]) => ({ index, score }));
}

// ============ 拓扑链召回 ============
/**
 * 为单个名词构建拓扑链（相邻的表内名词）
 */
function buildNounTopology(nounId) {
  const nounEntry = nounIndex.nouns.find((n) => n.id === nounId);
  if (!nounEntry) return [];
  const results = [];
  for (const { start, end } of nounEntry.offsets) {
    const entry = offsetToChunk(start);
    if (!entry) continue;
    const relStart = start - entry.startOffset;
    const relEnd = end - entry.startOffset;
    const before = entry.text.slice(Math.max(0, relStart - TOPOLOGY_WINDOW * 12), relStart);
    const after = entry.text.slice(relEnd, Math.min(entry.text.length, relEnd + TOPOLOGY_WINDOW * 12));
    const beforeWords = before.split(/[\s\n.,;:!?]+/).filter((w) => w.length > 1).slice(-TOPOLOGY_WINDOW);
    const afterWords = after.split(/[\s\n.,;:!?]+/).filter((w) => w.length > 1).slice(0, TOPOLOGY_WINDOW);
    results.push({
      chunkKey: entry.chunkKey,
      page: entry.page,
      offset: start,
      neighbors: [...new Set([...beforeWords, ...afterWords])],
    });
  }
  return results;
}

/**
 * 获取高分词的拓扑链，并汇总出现过的 bookKey
 */
function getTopologyBookKeys(nounId) {
  const chains = buildNounTopology(nounId);
  const bookKeys = new Set();
  for (const c of chains) {
    if (c.chunkKey) bookKeys.add(c.chunkKey);
  }
  return { chains, bookKeys: [...bookKeys] };
}

/**
 * 从 bookKey 召回原文文本
 */
function recallByBookKey(chunkKey) {
  const entry = chunkEntries.find((e) => e.chunkKey === chunkKey);
  return entry ? entry.text : null;
}

// ============ 主流程 ============
async function main() {
  const qList = questions.filter((q) => !QUESTION_IDS.length || QUESTION_IDS.includes(q.id));
  console.log(`========== 拓扑链召回引擎（两步架构）==========`);
  console.log(`全量名词: ${nounIndex.nouns.length}, 问题数: ${qList.length}`);
  console.log(`粗筛批次: ${COARSE_BATCH_SIZE}, 精打批次: ${SCORE_BATCH_SIZE}, 并发: ${CONCURRENCY}, TOP召回: ${TOP_N}\n`);

  const allResults = [];

  for (const q of qList) {
    console.log(`\n--- [${q.id}] ${q.question} ---`);
    const t0 = Date.now();

    // ====== 第一阶段：粗筛（LLM 1 轮） ======
    // 分批：每批 COARSE_BATCH_SIZE 个名词（用 nounIndex 原始顺序）
    const coarseBatches = [];
    for (let i = 0; i < nounIndex.nouns.length; i += COARSE_BATCH_SIZE) {
      coarseBatches.push({
        startIdx: i,
        batchNouns: nounIndex.nouns.slice(i, i + COARSE_BATCH_SIZE),
        batchId: coarseBatches.length,
      });
    }

    // 并发粗筛
    const coarseYes = new Map(); // globalNounIdx -> true（只标记通过粗筛）
    let coarsePromptTokens = 0, coarseCompletionTokens = 0, coarseFailedBatches = 0, coarseTruncated = 0;

    // 记录原始 LLM 输入/输出（前几个批次，供审查）
    const rawSamples = { coarseSamples: [], scoreSamples: [] };

    let batchIdx = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (true) {
          const myIdx = batchIdx++;
          if (myIdx >= coarseBatches.length) break;
          const b = coarseBatches[myIdx];
          const surfaces = b.batchNouns.map((n) => n.surface);
          const prompt = buildCoarsePrompt(q.question, surfaces);
          const res = await callLLM(prompt, 0, 1024); // 粗筛用 1024 足够
          // 只记录前 3 个批次的原始内容
          if (rawSamples.coarseSamples.length < 3) {
            rawSamples.coarseSamples.push({ batchIdx: myIdx, prompt, response: res?.text || '' });
          }
          if (res?.usage) {
            coarsePromptTokens += res.usage.prompt_tokens || 0;
            coarseCompletionTokens += res.usage.completion_tokens || 0;
          }
          if (res?.truncated) coarseTruncated++;
          const yesIndices = parseCoarseResult(res?.text || '', b.batchNouns.length);
          for (const localIdx of yesIndices) {
            coarseYes.set(b.startIdx + localIdx, true);
          }
          if (yesIndices.length === 0 && !res) coarseFailedBatches++;
          process.stdout.write(`\r  粗筛: ${coarseYes.size} 个 YES / ${nounIndex.nouns.length}, 批次 ${myIdx + 1}/${coarseBatches.length}          `);
        }
      })
    );

    console.log(`\n  粗筛完成: ${coarseYes.size}/${nounIndex.nouns.length} 个相关词 (失败: ${coarseFailedBatches}/${coarseBatches.length})`);
    console.log(`  粗筛 tokens: prompt=${coarsePromptTokens} completion=${coarseCompletionTokens}`);
    if (coarseTruncated > 0) console.log(`  ⚠️  粗筛截断: ${coarseTruncated}/${coarseBatches.length} 批次被截断`);

    // ====== 第二阶段：精打（LLM 2 轮，仅对粗筛 YES 的词） ======
    const yesEntries = [...coarseYes.keys()].map((globalIdx) => nounIndex.nouns[globalIdx]);
    const scored = new Map(); // globalNounIdx -> score

    let scorePromptTokens = 0, scoreCompletionTokens = 0;
    if (yesEntries.length === 0) {
      console.log('  粗筛无 YES 词，跳过精打');
    } else {
    // 对粗筛 YES 的词分批精打
      const scoreBatches = [];
      for (let i = 0; i < yesEntries.length; i += SCORE_BATCH_SIZE) {
        scoreBatches.push({
          startIdx: i,
          batchEntries: yesEntries.slice(i, i + SCORE_BATCH_SIZE),
          batchId: scoreBatches.length,
        });
      }

      let scoreBatchIdx = 0, scoreTruncated = 0;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (true) {
            const myIdx = scoreBatchIdx++;
            if (myIdx >= scoreBatches.length) break;
            const b = scoreBatches[myIdx];
            const surfaces = b.batchEntries.map((e) => e.surface);
            const prompt = buildScorePrompt(q.question, surfaces);
            const res = await callLLM(prompt, 0, 2500); // 精打用 2500，支持 80 词全打分
            // 只记录前 2 个批次的原始内容
            if (rawSamples.scoreSamples.length < 2) {
              rawSamples.scoreSamples.push({ batchIdx: myIdx, prompt, response: res?.text || '' });
            }
            if (res?.usage) {
              scorePromptTokens += res.usage.prompt_tokens || 0;
              scoreCompletionTokens += res.usage.completion_tokens || 0;
            }
            if (res?.truncated) scoreTruncated++;
            const scoredInBatch = parseScoreResult(res?.text || '', b.batchEntries.length);
            for (const { index, score } of scoredInBatch) {
              const entry = b.batchEntries[index];
              if (entry) scored.set(entry.id, score);
            }
            process.stdout.write(`\r  精打: ${scored.size}/${yesEntries.length} 个已打分, 批次 ${myIdx + 1}/${scoreBatches.length}          `);
          }
        })
      );

      console.log(`\n  精打完成: ${scored.size}/${yesEntries.length} 个已打分`);
      console.log(`  精打 tokens: prompt=${scorePromptTokens} completion=${scoreCompletionTokens}`);
      if (scoreTruncated > 0) console.log(`  ⚠️  精打截断: ${scoreTruncated}/${scoreBatches.length} 批次被截断`);
    }

    // ====== 排序与召回 ======
    const scoredList = [...scored.entries()]
      .map(([nounId, score]) => {
        const n = nounIndex.nouns.find((x) => x.id === nounId);
        return n ? { id: n.id, surface: n.surface, df: n.offsets.length, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const lostCount = yesEntries.length - scored.size;
    if (lostCount > 0) {
      const lostRate = ((lostCount / yesEntries.length) * 100).toFixed(1);
      console.log(`  ⚠️  精打解析丢失: ${lostCount}/${yesEntries.length} 个词 (${lostRate}%)（LLM 输出格式异常，已丢弃）`);
    }

    const totalPromptTokens = coarsePromptTokens + scorePromptTokens;
    const totalCompletionTokens = coarseCompletionTokens + scoreCompletionTokens;

    console.log(`  Top 10: ${scoredList.slice(0, 10).map((s) => `${s.surface}(${s.score})`).join(', ')}`);

    // ====== 拓扑链 + 召回 ======
    const TOP_RECALL = Math.min(TOP_N, scoredList.length);

    const recallItems = [];
    const recalledBookKeys = new Set();

    for (let i = 0; i < TOP_RECALL; i++) {
      const item = scoredList[i];
      const { chains, bookKeys } = getTopologyBookKeys(item.id);
      for (const bk of bookKeys) recalledBookKeys.add(bk);
      recallItems.push({
        rank: i + 1,
        id: item.id,
        surface: item.surface,
        score: item.score,
        df: item.df,
        bookKeys,
        chainCount: chains.length,
        chainSample: chains.slice(0, 3).map((c) => ({ page: c.page, neighbors: c.neighbors })),
      });
    }

    const lowItems = scoredList.slice(TOP_RECALL).map((item) => {
      const { chains } = getTopologyBookKeys(item.id);
      return {
        id: item.id,
        surface: item.surface,
        score: item.score,
        df: item.df,
        chainCount: chains.length,
        chainSample: chains.slice(0, 2).map((c) => ({ page: c.page, neighbors: c.neighbors })),
      };
    });

    const recalledTexts = [];
    for (const bk of [...recalledBookKeys]) {
      const text = recallByBookKey(bk);
      if (text) recalledTexts.push({ chunkKey: bk, text: text.slice(0, 2000) });
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const result = {
      questionId: q.id,
      question: q.question,
      zone: q.zone,
      totalNouns: nounIndex.nouns.length,
      coarseYesCount: coarseYes.size,
      scoredCount: scored.size,
      selectedCount: scoredList.length,
      topRecallCount: TOP_RECALL,
      failedBatches: coarseFailedBatches,
      tokenCost: {
        coarsePromptTokens,
        coarseCompletionTokens,
        scorePromptTokens,
        scoreCompletionTokens,
        totalPromptTokens,
        totalCompletionTokens,
      },
      elapsedSecs: parseFloat(elapsed),
      scoredNouns: scoredList,
      recallItems,
      lowItems,
      recalledTexts,
      rawSamples,
    };

    allResults.push(result);
    console.log(`  召回 bookKey 数: ${recalledBookKeys.size}, 低分词: ${lowItems.length}, 耗时: ${elapsed}s`);

    // 每个问题完成后立即保存（断联也不丢）
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allResults, null, 2), 'utf-8');
    console.log(`  已增量保存到: ${OUTPUT_PATH}`);
  }

  console.log(`\n完成，结果已保存: ${OUTPUT_PATH}`);
}

main().catch(console.error);
