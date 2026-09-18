# 快速导航

> 3分钟了解项目核心内容

## 🎯 这是什么？

一个基于 **LLM名词评分 + 拓扑链扩展** 的文献召回系统，用于回答学术问题。

**输入**: "Pierre Janet和Freud对无意识的观点有何不同？"  
**输出**: 204个相关文献片段（自动去重，节省35.2% tokens）

---

## ⚡ 快速开始

```bash
# 1. 运行主召回引擎
node recall-nouns-llm.js Z1-Q1

# 2. 查看去重效果
node _analyze_dedup.cjs

# 3. 生成推理Prompt
node _exp32_generate_multipath_prompt.cjs
```

---

## 📂 核心文件（只需关注这些）

| 文件 | 说明 | 重要性 |
|------|------|--------|
| `README.md` | 项目概览 | ⭐⭐⭐ |
| `recall-nouns-llm.js` | 主召回引擎 | ⭐⭐⭐ |
| `_analyze_dedup.cjs` | 去重分析工具 | ⭐⭐ |
| `_exp32_generate_multipath_prompt.cjs` | 最优Prompt生成 | ⭐⭐ |
| `EXPERIMENTS_README.md` | 完整实验导航 | ⭐ |

---

## 🔑 核心数据

- **总名词数**: 18,378
- **高分名词** (score≥95): 80
- **去重前**: 315 chunks
- **去重后**: **204 chunks** ✅
- **节省比例**: 35.2%

---

## 📖 文档导航

| 想了解... | 阅读这个 |
|-----------|----------|
| 项目整体架构 | `README.md` |
| 所有实验的目的和结论 | `EXPERIMENTS_README.md` |
| LLM vs Embedding对比 | `embedding-vs-llm-noun-retrieval-comparison.md` |
| 材料溯源设计 | `_exp32_optimized_traceability_design.md` |
| Exp32使用方法 | `_exp32_README.md` |
| Exp30使用方法 | `_exp30_README.md` |

---

## 🎓 三个关键结论

### 1️⃣ LLM名词评分 > Embedding召回
经过Exp1-15验证，LLM语义理解能力显著优于向量相似度。

### 2️⃣ 必须做Chunk去重
35.2%的chunks被多个名词重复召回，Set去重即可解决。

### 3️⃣ 材料溯源提升答案质量
Exp32方案：每个chunk标注召回名词，按路径组织材料。

---

## 🗂️ 目录结构一览

```
项目根目录/
├── README.md                          ← 从这里开始
├── QUICK_START.md                     ← 你在这里
├── EXPERIMENTS_README.md              ← 完整实验导航
├── recall-nouns-llm.js                ← 主引擎
├── _analyze_dedup.cjs                 ← 去重分析
├── _exp32_*.cjs                       ← 最优方案（材料溯源）
├── noun-recall-results-Z1Q1.json      ← 召回结果
└── deprecated/                        ← 73个废弃文件
```

---

## ❓ 常见问题

**Q: 为什么选择LLM而不是Embedding？**  
A: 经过15个对比实验（Exp1-15），LLM在语义理解上显著优于Embedding。

**Q: 去重真的有必要吗？**  
A: 必要。实测35.2%的chunks是重复的，不去重会浪费大量tokens。

**Q: 什么是"材料溯源"？**  
A: Exp32提出的方案：标注每个chunk被哪些名词召回，提升可解释性。

**Q: 为什么有73个废弃文件？**  
A: 这些是探索过程的中间产物，结论已整合到核心文档中。

---

## 🚀 进阶阅读

1. 查看 `README.md` 了解完整架构
2. 运行 `node recall-nouns-llm.js Z1-Q1` 体验召回
3. 阅读 `EXPERIMENTS_README.md` 了解所有实验
4. 查看 `_exp32_README.md` 学习材料溯源方案

---

**快速问题？** 查看 `README.md` 的"常用命令"章节  
**深入研究？** 阅读 `EXPERIMENTS_README.md`
