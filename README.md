# 项目概览

首次接手可从[入库指南](ONBOARDING.md)了解仓库用途，沿聊天追踪灵感与实现状态，也可从代码反查设计来由。

## 📁 文件结构

```
项目根目录/
│
├── 📄 核心代码
│   ├── recall-nouns-llm.js                    ⭐⭐ 主召回引擎（两步LLM架构）
│   ├── _analyze_dedup.cjs                     ⭐ 去重效果分析工具
│   └── _probe_embed_model.cjs                 🔧 模型探测工具
│
├── 📊 关键实验（保留）
│   ├── _exp19_real_chunk_overlap_analysis.cjs ⭐ Chunk重复率分析（35.2%）
│   ├── _exp22_topology_offset_dedup.cjs       ⭐ 去重策略对比实验
│   ├── _exp26_reasoning_llm.cjs               ⭐ 推理基线测试
│   ├── _exp30_test_multipath_reasoning.cjs    ⭐ 多路径推理实验
│   ├── _exp32_generate_multipath_prompt.cjs   ⭐⭐ 最优Prompt生成器
│   ├── _exp32_build_prompt_with_traceback.cjs ⭐⭐ 材料溯源Prompt
│   ├── _exp34_extract_recalled_chunks.cjs     ⭐ 召回材料提取
│   └── _exp34_reasoning_with_full_recall.cjs  ⭐ 完整推理管线
│
├── 📖 文档
│   ├── README.md                              📌 本文档（项目概览）
│   ├── EXPERIMENTS_README.md                  📌 完整实验导航
│   ├── _exp30_README.md                       📄 Exp30: 多路径推理说明
│   ├── _exp32_README.md                       📄 Exp32: 材料溯源说明
│   ├── _exp32_optimized_traceability_design.md 📄 溯源设计文档
│   └── embedding-vs-llm-noun-retrieval-comparison.md 📄 召回方案对比总结
│
├── 💾 数据文件
│   ├── noun-recall-results-Z1Q1.json          📦 召回结果（204 chunks）
│   ├── _exp34_recalled_chunks_full.json       📦 完整召回材料
│   ├── topology-chains.json                   📦 拓扑链数据
│   ├── candidate-texts-for-llm.json
│   ├── material-traceback-map.json
│   ├── noun-list-by-freq.txt
│   └── noun-list-clean.txt
│
└── 🗑️ deprecated/                             (73个废弃文件)
    └── ... 中间过程、临时输出、被替代的实验
```

---

## 🎯 项目核心成果

### 1. 召回架构：两步LLM评分 + 拓扑链扩展

**实现**: `recall-nouns-llm.js`

```
用户问题
    ↓
[步骤1] 粗筛（LLM）: 18,378个名词 → ~240个相关名词
    ↓
[步骤2] 精打（LLM）: 240个名词 → 80个高分名词 (score≥95)
    ↓
[步骤3] 拓扑链扩展: 80个名词 → 315个chunk引用
    ↓
[步骤4] ChunkKey去重: 315个 → 204个唯一chunks ✅
    ↓
输出: 204个去重后的文献片段
```

**Token消耗**: 
- 粗筛: ~200K prompt tokens + 2.5K completion tokens
- 精打: ~50K prompt tokens + 1K completion tokens
- **总计**: ~250K tokens（单个问题）

**核心优势**:
- ✅ LLM语义理解优于Embedding
- ✅ 自动去重，节省35.2% tokens
- ✅ 保留拓扑关系，召回相关上下文

---

### 2. 去重策略：ChunkKey Set去重

**结论**: `_exp19` + `_exp22` + `_analyze_dedup.cjs`

| 指标 | 数值 |
|------|------|
| 召回前（带重复） | 315 chunks |
| 去重后 | **204 chunks** |
| 重复率 | **35.2%** |
| 节省chunks | 111个 |

**实现方式**:
```javascript
const recalledBookKeys = new Set();  // 自动去重
for (const noun of topNouns) {
  const { bookKeys } = getTopologyBookKeys(noun.id);
  bookKeys.forEach(bk => recalledBookKeys.add(bk));
}
// recalledBookKeys.size === 204 ✅
```

**对比方案**:
- ❌ Offset区间合并：复杂，效果相同
- ✅ **ChunkKey Set去重：简单，高效** ⭐

---

### 3. 推理优化：材料溯源 + 多路径Prompt

**最优方案**: Exp32（`_exp32_generate_multipath_prompt.cjs`）

**核心创新**:
1. **材料溯源**: 每个chunk标注召回它的名词
2. **多路径组织**: 按名词分组，展示检索路径
3. **可追溯性**: LLM可以引用材料来源

**Prompt结构**:
```markdown
【问题】Pierre Janet和Freud对无意识的观点有何不同？

【召回路径】

路径1: "Inconscient" (score: 100, 27次出现)
  召回材料:
    [M1] 页码0: ...l'Inconscient...
    [M5] 页码0: ...formations de l'Inconscient...
    ...

路径2: "Freud" (score: 95, 31次出现)
  召回材料:
    [M1] 页码0: ...Freud...
    [M6] 页码0: ...Freud a découvert...
    ...

路径3: "Pierre Janet" (score: 95, 1次出现)
  召回材料:
    [M42] 页码0: ...Pierre Janet...
    ...

【所有召回材料】
[M1] 页码0: <完整文本>
[M2] 页码0: <完整文本>
...
```

**效果**:
- ✅ 答案质量提升
- ✅ 材料利用率提高
- ✅ 可验证引用来源

---

## 📊 关键数据（Z1-Q1测试）

| 指标 | 数值 |
|------|------|
| 问题 | "Pierre Janet和Freud对无意识的观点有何不同？" |
| 名词总数 | 18,378 |
| 粗筛通过 | 240 (1.3%) |
| 精打高分 | 80 (score≥95) |
| 拓扑链召回 | 315 chunks |
| **去重后** | **204 chunks** ⭐ |
| 重复率 | 35.2% |
| 平均chunk长度 | ~500字符 |
| 总材料长度 | ~100K字符 |

---

## 🔧 常用命令

### 运行主召回引擎
```bash
node recall-nouns-llm.js                    # 所有问题
node recall-nouns-llm.js Z1-Q1              # 单个问题
TOP_N=100 node recall-nouns-llm.js          # 自定义Top-N
```

### 分析去重效果
```bash
node _analyze_dedup.cjs                     # 分析当前去重效果
```

### 提取召回材料
```bash
node _exp34_extract_recalled_chunks.cjs     # 从结果提取完整材料
```

### 生成溯源Prompt
```bash
node _exp32_generate_multipath_prompt.cjs   # 生成多路径prompt
node _exp32_build_prompt_with_traceback.cjs # 生成带溯源的prompt
```

### 测试推理
```bash
node _exp34_reasoning_with_full_recall.cjs <API_KEY>  # 完整推理测试
```

---

## 📈 实验历程总结

### 阶段1: 召回方案选型（Exp 1-15）
- **问题**: Embedding召回 vs LLM名词评分？
- **结论**: ✅ **LLM名词评分显著优于Embedding**
- **文档**: `embedding-vs-llm-noun-retrieval-comparison.md`

### 阶段2: 去重策略优化（Exp 16-24）
- **问题**: 多个名词召回相同chunk，token浪费
- **发现**: 35.2%的重复率
- **结论**: ✅ **ChunkKey Set去重即可**
- **关键实验**: Exp19, Exp22

### 阶段3: 推理管线优化（Exp 25-34）
- **问题**: 如何组织材料，提升答案质量？
- **创新**: 材料溯源 + 多路径Prompt
- **结论**: ✅ **Exp32方案最优**
- **文档**: `_exp32_README.md`, `_exp32_optimized_traceability_design.md`

---

## 🎓 核心经验

### ✅ 采用的方案
1. **LLM名词评分** > Embedding（召回准确率更高）
2. **两步架构**（粗筛+精打）节省token
3. **ChunkKey去重**（简单高效，35.2%节省）
4. **材料溯源**（提升可解释性）

### ❌ 放弃的方案
1. ~~Embedding召回~~（准确率不如LLM）
2. ~~Offset区间合并去重~~（复杂度高，效果相同）
3. ~~单层LLM评分~~（token消耗过大）

---

## 📚 推荐阅读顺序

1. **快速了解**: 本文档（README.md）
2. **完整导航**: `EXPERIMENTS_README.md`
3. **召回对比**: `embedding-vs-llm-noun-retrieval-comparison.md`
4. **去重分析**: 运行 `node _analyze_dedup.cjs`
5. **溯源设计**: `_exp32_optimized_traceability_design.md`
6. **代码实现**: `recall-nouns-llm.js`（主引擎）

---

## 🚀 下一步

- [ ] 完善 `recall-nouns-llm.js` 的文档注释
- [ ] 集成 Exp32 溯源prompt到主管线
- [ ] 批量测试更多问题
- [ ] 性能优化（并发、缓存）
- [ ] 导出标准API接口

---

**项目状态**: ✅ 核心功能完成，文档完善  
**创建时间**: 2026-09-18  
**维护者**: [Your Name]
