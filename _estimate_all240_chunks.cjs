const fs = require('fs');

const recallResult = JSON.parse(fs.readFileSync('noun-recall-results-Z1Q1.json', 'utf-8'))[0];

console.log('问题:', recallResult.questionId);
console.log('问题内容:', recallResult.question);
console.log('='.repeat(80));
console.log('');

// Top 80 名词的chunk统计
const top80BookKeys = new Set();
let top80TotalChainCount = 0;

recallResult.recallItems.forEach(item => {
  top80TotalChainCount += item.chainCount;
  item.bookKeys.forEach(bk => top80BookKeys.add(bk));
});

console.log('Top 80 名词统计:');
console.log('  名词数:', recallResult.recallItems.length);
console.log('  总出现次数（chainCount之和）:', top80TotalChainCount);
console.log('  去重后chunk数:', top80BookKeys.size);
console.log('  平均每个名词:', (top80TotalChainCount / recallResult.recallItems.length).toFixed(2), '次出现');
console.log('  去重率:', ((1 - top80BookKeys.size / top80TotalChainCount) * 100).toFixed(1), '%');
console.log('');

// 低分160个名词的chunk统计（只有chainCount，没有bookKeys）
let lowTotalChainCount = 0;
recallResult.lowItems.forEach(item => {
  lowTotalChainCount += item.chainCount;
});

console.log('Low 160 名词统计:');
console.log('  名词数:', recallResult.lowItems.length);
console.log('  总出现次数（chainCount之和）:', lowTotalChainCount);
console.log('  平均每个名词:', (lowTotalChainCount / recallResult.lowItems.length).toFixed(2), '次出现');
console.log('');

// 全部240个名词
const totalChainCount = top80TotalChainCount + lowTotalChainCount;
console.log('全部 240 名词统计:');
console.log('  总出现次数（chainCount之和）:', totalChainCount);
console.log('  平均每个名词:', (totalChainCount / 240).toFixed(2), '次出现');
console.log('');

// 估算全部240个名词的去重chunk数
// 使用Top 80的去重率作为参考
const top80DedupRate = 1 - top80BookKeys.size / top80TotalChainCount;
const estimatedAll240Chunks = Math.round(totalChainCount * (1 - top80DedupRate));

console.log('估算全部240个名词的去重chunk数:');
console.log('  如果使用Top 80的去重率(' + (top80DedupRate * 100).toFixed(1) + '%):', estimatedAll240Chunks, 'chunks');
console.log('');

console.log('⚠️  注意:');
console.log('  - 这是估算值，实际值可能因为低分词与高分词的chunk重叠而更低');
console.log('  - 要获得准确值，需要访问docuverse文件重新构建拓扑链');
console.log('');

console.log('关键发现:');
console.log('  ✅ 204 = Top 80 名词的拓扑链去重后的chunk数（已确认）');
console.log('  📊 全部 240 名词估算约', estimatedAll240Chunks, 'chunks（待验证）');
