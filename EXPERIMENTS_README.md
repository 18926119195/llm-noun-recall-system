# 实验目录与导航

本文档记录了所有实验的目的、结论和文件位置。

## 目录结构

```
experiments/
├── 01-embedding-recall/           # Exp 1-3: Embedding召回实验
├── 02-retrieval-evaluation/       # Exp 4-15: 召回质量评估
├── 03-score-threshold/            # Exp 16-17: 评分阈值分析
├── 04-deduplication/              # Exp 18-24, 33: Chunk去重策略
├── 05-reasoning-pipeline/         # Exp 25-32, 34: 推理管线优化
├── 06-analysis-tools/             # 分析工具脚本
└── deprecated/                    # 已废弃的实验
```

---

## 📊 有效实验（保留）

### 1️⃣ Embedding 召回基线实验 (Exp 1-3)

**目的**: 验证 embedding 召回的基础能力

| 实验 | 文件 | 结论 |
|------|------|------|
| Exp1 | `_exp1_check_fields.cjs` | 检查数据字段完整性 ✅ |
| Exp2 | `_exp2_embedding_recall.cjs`<br>`_exp2_embedding_scores.json` | Embedding 召回名词，获得评分 |
| Exp3 | `_exp3_chunk_embedding_recall.cjs`<br>`_exp3_chunk_scores.json` | Chunk级别的embedding召回 |

**状态**: ✅ 完成，结论已验证

---

### 2️⃣ 召回质量对比实验 (Exp 4-15)

**目的**: 对比 Embedding vs LLM 名词评分的召回质量

| 实验组 | 文件 | 结论 |
|--------|------|------|
| **Exp 4-5**<br>关键词分析 | `_exp4_keyword_analysis.cjs`<br>`_exp5_retrieval_compare.cjs` | 关键词分布分析，召回策略对比 |
| **Exp 6-9**<br>人工评估 | `_exp6_chunk_content_for_eval.cjs`<br>`_exp7_manual_eval.cjs`<br>`_exp8_auto_eval.cjs`<br>`_exp9_detailed_comparison.cjs` | LLM评分 > Embedding召回 ✅ |
| **Exp 10-15**<br>批量验证 | `_exp10_manual_judgment.cjs`<br>`_exp11_read_and_judge.cjs`<br>`_exp13_fixed_llm_ranking.cjs`<br>`_exp15_batch_comparison.cjs` | 批量对比，确认LLM名词评分优势 |

**最终结论**: ✅ **LLM名词评分召回率更高，采用该方案**

**文档**: 
- `embedding-vs-llm-noun-retrieval-comparison.md`
- `实验报告-召回使用率对比-Embedding-vs-LLM名词评分.md`

---

### 3️⃣ 评分阈值优化 (Exp 16-17)

**目的**: 确定最优的名词评分阈值（Top-K vs Score Threshold）

| 实验 | 文件 | 结论 |
|------|------|------|
| Exp16 | `_exp16_score_threshold_analysis.cjs`<br>`_exp16_threshold_analysis.json` | 不同阈值下的召回效果 |
| Exp17 | `_exp17_detailed_threshold_analysis.cjs`<br>`_exp17_threshold_analysis_detailed.json` | 详细阈值分析 |

**结论**: ✅ **推荐使用 score >= 95 或 Top 10-15 名词**

---

### 4️⃣ Chunk 去重策略 (Exp 18-24, 33) ⭐

**目的**: 解决多个名词召回相同chunk导致的token浪费

| 实验 | 文件 | 核心发现 |
|------|------|----------|
| Exp18 | `_exp18_topology_deduplication_analysis.cjs` | 发现拓扑链存在chunk重复问题 |
| Exp19 | `_exp19_real_chunk_overlap_analysis.cjs`<br>`_exp19_chunk_overlap_analysis.json` | **重复率: 35.2%**，Top10约111个重复chunk |
| Exp20 | `_exp20_batch_threshold_analysis.cjs` | 批量阈值测试 |
| Exp21 | `_exp21_compare_dedup_strategies.cjs` | 对比去重策略 |
| Exp22 | `_exp22_topology_offset_dedup.cjs`<br>`_exp22_topology_offset_dedup.json` | **ChunkKey去重 vs Offset区间合并** |
| Exp23 | `_exp23_show_duplicate_chunks.cjs`<br>`_exp23_duplicate_chunks.json` | 展示重复chunk详情 |
| Exp24 | `_exp24_full_dedup_analysis.cjs`<br>`_exp24_full_dedup_analysis.json` | 完整去重分析 |
| Exp33 | `_exp33_verify_dedup.cjs` | 验证去重逻辑 |

**最终结论**: ✅ **ChunkKey Set去重即可，无需复杂的区间合并**

**实测效果**: 
- 去重前: 315 chunks
- 去重后: 204 chunks  
- 节省: **35.2%** (111 chunks)

---

### 5️⃣ 推理管线优化 (Exp 25-32, 34) ⭐⭐

**目的**: 优化材料组织和推理prompt，提升答案质量

#### 阶段1: Token流追溯 (Exp 25-27)

| 实验 | 文件 | 目的 |
|------|------|------|
| Exp25 | `_exp25_token_flow_explanation.cjs` | 解释token流动机制 |
| Exp26 | `_exp26_reasoning_llm.cjs`<br>`_exp26_reasoning_output.json` | 基线推理测试 |
| Exp27 | `_exp27_embed_noun_overlap.cjs` | 分析名词-embedding重叠度 |

#### 阶段2: 多路径Prompt设计 (Exp 28-30)

| 实验 | 文件 | 核心创新 |
|------|------|----------|
| Exp28 | `_exp28_multipath_prompt_demo.md`<br>`_exp28_output_comparison.md` | 提出"多路径"prompt概念 |
| Exp29 | `_exp29_test_multipath_prompt.cjs` | 测试多路径prompt |
| Exp30 | `_exp30_test_multipath_reasoning.cjs`<br>`_exp30_README.md`<br>`_exp30_material_traceability_analysis.md` | **材料可追溯性分析** ⭐ |

**Exp30 核心发现**: 需要标注每个chunk被哪些名词召回（材料溯源）

#### 阶段3: 完整推理管线 (Exp 31-32, 34)

| 实验 | 文件 | 功能 |
|------|------|------|
| Exp31 | `_exp31_v4flash_no_thinking.cjs` | 测试不同模型 |
| Exp32 | `_exp32_generate_multipath_prompt.cjs`<br>`_exp32_build_prompt_with_traceback.cjs`<br>`_exp32_parse_and_inject_traceback.cjs`<br>`_exp32_README.md`<br>`_exp32_optimized_traceability_design.md` | **完整的材料溯源+多路径prompt** ⭐⭐ |
| Exp34 | `_exp34_extract_recalled_chunks.cjs`<br>`_exp34_reasoning_with_full_recall.cjs`<br>`_exp34_recalled_chunks_full.json` | 提取完整召回材料(204 chunks) |

**Exp32 是当前最优方案**:
- ✅ 每个chunk标注召回它的名词
- ✅ 按名词组织多路径
- ✅ 保留材料可追溯性

---

### 6️⃣ 分析工具

| 文件 | 功能 |
|------|------|
| `_analyze_dedup.cjs` | 分析去重效果（今天新建） ⭐ |
| `_probe_embed_model.cjs` | 探测可用的embedding模型 |
| `_compare_deep.cjs` | 深度对比工具 |
| `_compare_sources.cjs` | 对比数据源 |
| `_compare_transcripts.cjs` | 对比实验记录 |

---

## 🗑️ 废弃实验（可删除）

### 中间过程文件（结论已合并）

- `_exp11_my_manual_eval.md` → 结论已合并到总结
- `_exp11_output.txt` → 临时输出
- `_exp12_final_manual_eval.md` → 结论已合并
- `_exp14_corrected_eval.md` → 修正后的评估，已过时
- `_exp23_qkv_dynamic_constraint_analysis.md` → 探索性分析，未采用
- `_exp29_multipath_prompt_test.txt` → 临时测试输出
- `_exp31_run_log.txt` → 运行日志
- `_exp32_simplified_output.txt` → 临时输出
- `_exp32_test_report.md` → 已过时的测试报告

### 被否定的方案

- `_exp6_chunks_output.txt` → 中间输出，已无用
- `_exp7_chunks_for_eval.json` → 已被更新的评估取代
- `_exp8_eval_results.json` → 旧版评估结果
- `_exp13_fixed_chunks_for_eval.json` → 临时数据
- `_exp34_extract_recalled_chunks_simple.cjs` → 被完整版取代

---

## 📁 建议的文件组织

### 保留的核心文件 (15个)

```
实验代码/
├── recall-nouns-llm.js                    # ⭐⭐ 主召回引擎（已实现去重）
├── _analyze_dedup.cjs                     # ⭐ 去重效果分析
├── _exp19_real_chunk_overlap_analysis.cjs # ⭐ 重复率分析（35.2%）
├── _exp22_topology_offset_dedup.cjs       # ⭐ 去重策略对比
├── _exp30_test_multipath_reasoning.cjs    # ⭐ 多路径推理测试
├── _exp32_generate_multipath_prompt.cjs   # ⭐⭐ 最优prompt生成
├── _exp32_build_prompt_with_traceback.cjs # ⭐⭐ 材料溯源prompt
├── _exp34_extract_recalled_chunks.cjs     # ⭐ 提取召回材料
├── _exp34_reasoning_with_full_recall.cjs  # ⭐ 完整推理管线
└── _probe_embed_model.cjs                 # 工具：探测模型

文档/
├── EXPERIMENTS_README.md                  # 本文档 ⭐⭐
├── _exp30_README.md                       # Exp30详细说明
├── _exp32_README.md                       # Exp32详细说明
├── _exp32_optimized_traceability_design.md # 溯源设计文档
└── embedding-vs-llm-noun-retrieval-comparison.md # 召回对比总结

数据/
├── noun-recall-results-Z1Q1.json          # 召回结果（204 chunks）
├── _exp34_recalled_chunks_full.json       # 完整材料
└── topology-chains.json                   # 拓扑链数据
```

### 可删除的文件 (约60个)

所有标记为"废弃"的实验文件和临时输出。

---

## 🎯 核心结论总结

### 1. 召回策略
✅ **LLM名词评分** > Embedding召回  
✅ 推荐阈值: **score >= 95** 或 **Top 10-15**

### 2. 去重策略  
✅ **ChunkKey Set去重**（已实现）  
✅ 节省效果: **35.2%** (315 → 204 chunks)

### 3. 推理管线
✅ **材料溯源 + 多路径prompt**（Exp32方案）  
✅ 每个chunk标注召回名词  
✅ 按名词组织检索路径

### 4. 实测数据 (Z1-Q1)
- 高分名词: 80个 (score >= 95)
- 去重后chunks: 204个
- Token节省: 35.2%
- 召回准确率: 显著优于embedding

---

## 📝 下一步工作

1. ✅ 删除废弃文件（60+个）
2. ✅ 重组目录结构
3. ⏳ 完善 `recall-nouns-llm.js` 注释
4. ⏳ 集成 Exp32 的溯源prompt到主管线
5. ⏳ 批量测试其他问题

---

**创建时间**: 2026-09-18  
**最后更新**: 2026-09-18
