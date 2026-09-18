#!/usr/bin/env node
/**
 * Exp32: 生成带溯源映射的双输出
 * 
 * 输出1: candidate-texts-for-llm.json (简洁版，给LLM用)
 *   - 只包含: id, page, nounCount, text
 *   - 不含chunkKey等内部标识
 * 
 * 输出2: material-traceback-map.json (后台映射表)
 *   - 包含: chunkKey, page, nounCount, hits (名词精确偏移)
 *   - 用于从【【N】】溯源到原文绝对位置
 */

const fs = require('fs');
const path = require('path');

const WORKDIR = path.resolve(__dirname);

console.log('='.repeat(80));
console.log('Exp32: 构建带溯源映射的双输出');
console.log('='.repeat(80));

// 1. 读取数据
const z1q1Data = JSON.parse(fs.readFileSync(path.join(WORKDIR, 'noun-recall-results-Z1Q1.json'), 'utf8'));
const topologyChains = JSON.parse(fs.readFileSync(path.join(WORKDIR, 'topology-chains.json'), 'utf8'));
const candidateTextsDeduped = JSON.parse(fs.readFileSync(path.join(WORKDIR, 'candidate-texts-deduped.json'), 'utf8'));

console.log(`✅ 读取 noun-recall-results-Z1Q1.json: ${z1q1Data.length} 个问题`);
console.log(`✅ 读取 topology-chains.json: ${topologyChains.chains.length} 个chains`);
console.log(`✅ 读取 candidate-texts-deduped.json: ${candidateTextsDeduped.length} 个问题`);

// 2. 建立 text → chain 的映射（用于查找chunkKey和hits）
// 注意：这里用 text 做key不够精确，但candidateTextsDeduped里没有chunkKey，只能这样
const textToChainMap = new Map();
for (const chain of topologyChains.chains) {
  // 用 page + text前100字符 作为粗略的key
  const key = `${chain.page}_${chain.text ? chain.text.substring(0, 100) : ''}`;
  textToChainMap.set(key, chain);
}

console.log(`✅ 建立text→chain映射: ${textToChainMap.size} 条记录`);

// 3. 处理每个问题
const outputForLLM = [];
const tracebackMaps = {};

for (const entry of candidateTextsDeduped) {
  const questionId = entry.questionId;
  const question = entry.question;
  const chunks = entry.chunks || [];

  console.log(`\n处理问题: [${questionId}] ${question}`);
  console.log(`  去重后chunks数: ${chunks.length}`);

  // 给LLM的简洁版
  const llmChunks = [];
  // 后台映射表
  const tracebackMap = {};

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const materialId = i + 1;

    // 输出1: LLM用的简洁版（不含chunkKey）
    llmChunks.push({
      id: materialId,
      page: chunk.page,
      nounCount: chunk.nounCount,
      minThresholdSelected: chunk.minThresholdSelected,
      text: chunk.text
    });

    // 输出2: 后台映射表（含chunkKey和hits）
    // 尝试从topology-chains中找到对应的chain
    const lookupKey = `${chunk.page}_${chunk.text ? chunk.text.substring(0, 100) : ''}`;
    const chain = textToChainMap.get(lookupKey);

    if (chain) {
      tracebackMap[materialId] = {
        chunkKey: chain.chunkKey,
        page: chain.page,
        nounCount: chain.nounCount,
        minThresholdSelected: chunk.minThresholdSelected,
        hits: chain.hits || []  // 保留所有命中的名词及其偏移量
      };
    } else {
      // 如果找不到对应的chain，至少保留基本信息
      console.warn(`  ⚠️  材料${materialId}未找到对应的topology chain (page=${chunk.page})`);
      tracebackMap[materialId] = {
        chunkKey: null,
        page: chunk.page,
        nounCount: chunk.nounCount,
        minThresholdSelected: chunk.minThresholdSelected,
        hits: []
      };
    }
  }

  outputForLLM.push({
    questionId,
    question,
    zone: entry.zone,
    uniqueChunks: chunks.length,
    chunks: llmChunks
  });

  tracebackMaps[questionId] = {
    question,
    totalMaterials: chunks.length,
    materials: tracebackMap
  };

  console.log(`  ✅ 生成${chunks.length}个材料的溯源映射`);
}

// 4. 保存输出
const llmOutputPath = path.join(WORKDIR, 'candidate-texts-for-llm.json');
const tracebackOutputPath = path.join(WORKDIR, 'material-traceback-map.json');

fs.writeFileSync(llmOutputPath, JSON.stringify(outputForLLM, null, 2), 'utf8');
fs.writeFileSync(tracebackOutputPath, JSON.stringify(tracebackMaps, null, 2), 'utf8');

console.log('\n' + '='.repeat(80));
console.log('✅ 双输出生成完成！');
console.log('='.repeat(80));
console.log(`📄 LLM输入文件: ${llmOutputPath}`);
console.log(`   - 简洁格式，不含chunkKey`);
console.log(`   - 包含: id, page, nounCount, text`);
console.log(`\n🔍 溯源映射文件: ${tracebackOutputPath}`);
console.log(`   - 包含chunkKey和hits精确偏移`);
console.log(`   - 可从【【N】】反查到原文绝对位置`);
console.log('='.repeat(80));

// 5. 统计报告
console.log('\n📊 统计报告:');
for (const entry of outputForLLM) {
  const traceback = tracebackMaps[entry.questionId];
  const withChunkKey = Object.values(traceback.materials).filter(m => m.chunkKey !== null).length;
  const withoutChunkKey = traceback.totalMaterials - withChunkKey;
  
  console.log(`\n  [${entry.questionId}] ${entry.question}`);
  console.log(`    总材料数: ${traceback.totalMaterials}`);
  console.log(`    有chunkKey: ${withChunkKey} ✅`);
  if (withoutChunkKey > 0) {
    console.log(`    缺chunkKey: ${withoutChunkKey} ⚠️`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('下一步: 运行 node _exp32_generate_multipath_prompt.cjs');
console.log('='.repeat(80));
