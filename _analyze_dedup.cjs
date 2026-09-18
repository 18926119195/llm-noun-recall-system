#!/usr/bin/env node
/**
 * 分析当前检索流水线中的 chunk 去重情况
 */

const fs = require('fs');

// 读取 recall 结果
const recallResults = JSON.parse(fs.readFileSync('noun-recall-results-Z1Q1.json', 'utf8'));
const z1q1 = recallResults[0];

console.log('=== 当前 recall-nouns-llm.js 流水线分析 ===\n');

console.log('基本统计:');
console.log('  高分词 (topRecallCount):', z1q1.topRecallCount);
console.log('  recalledTexts 数量 (去重后):', z1q1.recalledTexts.length);

// 检查 recallItems 中的 chain 信息
const totalChainCount = z1q1.recallItems.reduce((sum, item) => sum + item.chainCount, 0);
console.log('  recallItems 总 chainCount:', totalChainCount);

console.log('\n--- 检查 recalledTexts 去重情况 ---');

// 检查 recalledTexts 中的唯一 chunkKey
const chunkKeys = z1q1.recalledTexts.map(t => t.chunkKey);
const uniqueChunkKeys = [...new Set(chunkKeys)];
console.log('  原始 chunkKey 数量:', chunkKeys.length);
console.log('  唯一 chunkKey 数量:', uniqueChunkKeys.length);

if (chunkKeys.length !== uniqueChunkKeys.length) {
  const duplicateCount = chunkKeys.length - uniqueChunkKeys.length;
  console.log('  有重复的 chunkKey 数量:', duplicateCount);
  console.log('  重复率:', (duplicateCount / chunkKeys.length * 100).toFixed(1) + '%');
} else {
  console.log('  ✅ recalledTexts 已经完全去重，无重复');
}

console.log('\n--- 分析拓扑链级别的重复 ---');

// 从 recallItems 中提取每个词的 bookKeys
const allBookKeys = [];
z1q1.recallItems.forEach(item => {
  allBookKeys.push(...item.bookKeys);
});

const uniqueBookKeys = [...new Set(allBookKeys)];
console.log('  所有名词的 bookKeys 汇总:', allBookKeys.length);
console.log('  去重后 unique bookKeys:', uniqueBookKeys.length);
console.log('  拓扑链级别的重复率:', ((allBookKeys.length - uniqueBookKeys.length) / allBookKeys.length * 100).toFixed(1) + '%');

console.log('\n--- 结论 ---');

if (z1q1.recalledTexts.length === uniqueBookKeys.length) {
  console.log('✅ 当前流水线已经正确实现了 chunkKey 去重');
  console.log('   去重后发送给推理模型的 chunk 数量:', z1q1.recalledTexts.length);
} else {
  console.log('❌ 存在不一致');
  console.log('   recalledTexts 数量:', z1q1.recalledTexts.length);
  console.log('   理论上应该是:', uniqueBookKeys.length);
}

console.log('\n--- 验证去重效果 ---');
console.log('如果去掉去重逻辑（不做 chunkKey 去重），发送的 chunk 数量将是:', allBookKeys.length);
console.log('节省的 chunk 数量:', allBookKeys.length - uniqueBookKeys.length);
console.log('节省比例:', ((allBookKeys.length - uniqueBookKeys.length) / allBookKeys.length * 100).toFixed(1) + '%');
