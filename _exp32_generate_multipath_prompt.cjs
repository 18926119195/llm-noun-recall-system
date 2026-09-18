#!/usr/bin/env node
/**
 * Exp32: 生成支持多材料引用的Prompt
 * 
 * 输入: candidate-texts-for-llm.json
 * 输出: _exp32_multipath_prompt.txt
 * 
 * 核心改进：
 * 1. 在指令中明确：每个推理步骤可以引用多个材料
 * 2. 给出多材料引用的格式示例
 * 3. 鼓励对比论证、交叉验证、综合支撑
 */

const fs = require('fs');
const path = require('path');

const WORKDIR = path.resolve(__dirname);

console.log('='.repeat(80));
console.log('Exp32: 生成支持多材料引用的Prompt');
console.log('='.repeat(80));

// 1. 读取数据
const candidateTextsForLLM = JSON.parse(fs.readFileSync(path.join(WORKDIR, 'candidate-texts-for-llm.json'), 'utf8'));

// 2. 选择第一个问题（Z1-Q1）
const entry = candidateTextsForLLM.find(e => e.questionId === 'Z1-Q1');
if (!entry) {
  console.error('❌ 未找到 Z1-Q1');
  process.exit(1);
}

const questionId = entry.questionId;
const question = entry.question;
const chunks = entry.chunks || [];

console.log(`\n问题: [${questionId}] ${question}`);
console.log(`材料数: ${chunks.length}`);

// 3. 构造Prompt
const lines = [];

// 问题
lines.push(`问题：${question}`);
lines.push('');
lines.push('材料：');
lines.push('');

// 每个chunk作为一个【【N】】编号材料
for (const chunk of chunks) {
  const meta = `(页码: ${chunk.page}, 名词命中数: ${chunk.nounCount})`;
  lines.push(`【【${chunk.id}】】${meta}`);
  lines.push(chunk.text);
  lines.push('');
}

lines.push('');
lines.push('---');
lines.push('');

// 核心指令：支持多材料引用
lines.push('要求：从 2-4 个不同角度分析问题，输出多条独立推理路径。');
lines.push('');
lines.push('每条路径必须：');
lines.push('1. 有独特的分析视角（不重复其他路径）');
lines.push('2. 包含多个推理步骤，每步可以引用**一个或多个**材料');
lines.push('3. 结尾有该路径的初步结论');
lines.push('');
lines.push('格式：');
lines.push('');
lines.push('# 路径一：[路径名]');
lines.push('思路：[1句话说明角度]');
lines.push('');
lines.push('步骤1：使用【【X】】，提取...，判断...');
lines.push('步骤2：综合【【Y】】【【Z】】，对比...，发现...');
lines.push('步骤3：结合【【X】】【【W】】，交叉验证...');
lines.push('');
lines.push('结论：[本路径的初步结论]');
lines.push('');
lines.push('# 路径二：[路径名]');
lines.push('思路：[不同角度]');
lines.push('');
lines.push('步骤1：综合【【A】】【【B】】【【C】】，从三个来源提取...');
lines.push('步骤2：使用【【D】】，验证...');
lines.push('');
lines.push('结论：...');
lines.push('');
lines.push('（继续路径三、四...，若材料支持的话）');
lines.push('');
lines.push('# 综合结论');
lines.push('[整合所有路径，给出问题最终答案]');
lines.push('');
lines.push('---');
lines.push('');
lines.push('**引用规范**：');
lines.push('- 单个材料：使用【【N】】，提取...，判断...');
lines.push('- 多个材料：综合【【N】】【【M】】【【K】】，对比/交叉验证/综合提取...');
lines.push('- 引用必须有明确的文本依据和推理逻辑');
lines.push('');
lines.push('**推理策略**：');
lines.push('- 对比论证：对比不同材料中的矛盾或差异');
lines.push('- 交叉验证：从多个材料中找到互相支撑的证据');
lines.push('- 综合支撑：从多处提取一致的特征或模式');

const prompt = lines.join('\n');

// 4. 保存
const outputPath = path.join(WORKDIR, '_exp32_multipath_prompt.txt');
fs.writeFileSync(outputPath, prompt, 'utf8');

console.log('\n' + '='.repeat(80));
console.log('✅ Prompt生成完成！');
console.log('='.repeat(80));
console.log(`📄 输出文件: ${outputPath}`);
console.log(`📏 Prompt长度: ${prompt.length} 字符`);
console.log(`📊 材料数: ${chunks.length}`);

// 5. 预览
console.log('\n--- 前 1000 字符预览 ---');
console.log(prompt.substring(0, 1000));
console.log('\n...(省略)...');
console.log('\n--- 末尾 500 字符预览 ---');
console.log(prompt.slice(-500));

console.log('\n' + '='.repeat(80));
console.log('下一步: 运行 node _exp32_test_multipath_reasoning.cjs');
console.log('='.repeat(80));
