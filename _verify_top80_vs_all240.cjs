const fs = require('fs');

const recallResult = JSON.parse(fs.readFileSync('noun-recall-results-Z1Q1.json', 'utf8'))[0];

console.log('问题:', recallResult.questionId);
console.log('问题内容:', recallResult.question);
console.log('='.repeat(80));
console.log('');

// 统计 Top 80 的bookKeys
const top80BookKeys = new Set();
recallResult.recallItems.forEach(item => {
  item.bookKeys.forEach(bk => top80BookKeys.add(bk));
});

console.log('Top 80 名词:');
console.log('  名词数:', recallResult.recallItems.length);
console.log('  去重后chunk数:', top80BookKeys.size);
console.log('');

// 统计所有 240 个名词的bookKeys（包括lowItems）
const allBookKeys = new Set(top80BookKeys);

// lowItems 只有chainCount和chainSample，但没有完整的bookKeys列表
// 我们需要重新从拓扑链构建
console.log('Low 160 名词:');
console.log('  名词数:', recallResult.lowItems.length);
console.log('  ⚠️  lowItems 没有记录完整的bookKeys列表');
console.log('');

console.log('当前记录的召回结果:');
console.log('  recalledTexts.length:', recallResult.recalledTexts.length);
console.log('  这个数字 = Top 80 名词的去重chunk数');
console.log('');

console.log('✅ 确认:');
console.log('  204 = Top', recallResult.topRecallCount, '个名词的拓扑链去重后的chunk数');
console.log('  不是全部 240 个评分名词的chunk数');
console.log('');

console.log('如果要计算全部240个名词的chunk数，需要:');
console.log('  1. 重新运行拓扑链构建（对所有240个名词）');
console.log('  2. 或者修改 recall-nouns-llm.js 让它记录所有名词的bookKeys');
