# Embedding vs LLM Noun→Chunk 检索对比实验报告

## 实验目标

对比两种文档检索方法的召回效果：
1. **Embedding方法**：对所有文本块做向量化，用问题向量召回相似度最高的Top-N chunks
2. **LLM Noun→Chunk方法**：用LLM评估所有名词与问题的相关性，通过高分名词的偏移量反查所在chunk

## 实验设置

- **文档**：《Cartographies schizoanalytiques》(Félix Guattari)
- **文本块数量**：1,446个可检索chunks
- **测试问题**：15个学术问题，涵盖精神分析、拉康理论、分裂分析等主题
- **Embedding模型**：text-embedding-3-large (OpenAI)
- **LLM评分模型**：Claude 3.5 Sonnet

## 召回逻辑（重要前提）

### Embedding召回
对每个文本块算embedding，与问题embedding算余弦相似度，按相似度**降序**取Top-N chunks。

### LLM Noun→Chunk召回（**按评分排序**）
1. 用LLM对全量18032个名词逐一打分（0-100），筛出 score ≥ 80 的高分名词
2. 每个高分名词都对应原文里的多个字符offset位置
3. 通过offset反查到这些位置所在的chunk，构成"被高分名词命中"的chunk集合
4. 对每个chunk计算一个**分数 = 命中它的所有高分noun中的最高分（maxScore）**
5. 多个高分noun命中同一chunk时，取最高分作为chunk排序依据（这就是"按评分召回"）
6. 把所有命中的chunk按 maxScore 降序、并列时按 hitCount（命中noun数）降序排序
7. 排序后的 Top-N chunks 就是 LLM 召回的结果

> 这个排序保证：被分最高的LLM名词命中的chunk排在最前面，被多个高分名词共现的chunk进一步靠前。这与Embedding的相似度排序是完全不同的信号。

## 核心发现

### 整体结果概览

在15个测试问题中：
- **8个问题**（53%）：LLM召回的Top10 chunks中，**0个**出现在Embedding Top100
- **3个问题**（20%）：LLM Top10中只有**1个**在Embedding Top100
- **1个问题**（7%）：LLM Top10中有**2个**在Embedding Top100
- **3个问题**（20%）：LLM Top10中有**3个**在Embedding Top100（最高值）

### 详细对比表

| 问题ID | LLM Top10 在 Emb Top100 | LLM Top30 在 Emb Top100 | 问题类型 |
|--------|------------------------|------------------------|----------|
| Z1-Q1 | **3/10** | 6/30 | 人物对比(Janet vs Freud) |
| Z1-Q3 | **3/10** | 3/30 | 概念对比(精神分析vs宗教) |
| Z3-Q1 | **3/10** | 10/30 | 三人对比(Janet/Freud/Jaspers) |
| Z4-Q3 | 2/10 | 3/30 | 历史问题(回到弗洛伊德运动) |
| Z3-Q3 | 1/10 | 2/30 | 概念辨析(欲望vs需求) |
| Z4-Q1 | 1/10 | 1/30 | 定义问题(机器欲望) |
| Z4-Q2 | 1/10 | 4/30 | 概念对比(精神分析vs分裂分析) |
| **Z1-Q2** | **0/10** | 4/30 | 理论问题(主体性) |
| **Z1-Q4** | **0/10** | 0/30 | 概念关系(分裂症vs精神病) |
| **Z2-Q1** | **0/10** | 1/30 | 概念性质(阉割的符号性) |
| **Z2-Q2** | **0/10** | 2/30 | 功能问题(转移) |
| **Z2-Q3** | **0/10** | 1/30 | 应用问题(三元结构) |
| **Z2-Q4** | **0/10** | 0/30 | 理论问题(主体建构) |
| **Z3-Q2** | **0/10** | 0/30 | 策略问题(精神病处理) |
| **Z4-Q4** | **0/10** | 0/30 | 事实查询(手册下载) |

## 典型案例深度分析

### 案例1：Z1-Q1 "Pierre Janet和Freud对无意识的观点有何不同？"

**LLM方法表现**：
- 召回74个chunks，Top chunk包含关键内容："Pierre Janet的automatisms psychologiques"和"Freud的l'inconscient fantasié"
- 命中高分名词：`freud(100)`, `pierre(100)`, `pierre_janet(100)`, `janet(95)`, `psychanalyse(85)` — 这5个高分noun在该chunk中共现，是回答"Janet vs Freud无意识观点差异"问题的唯一关键chunk
- **LLM#1排名**：maxScore=100, hitCount=5（按LLM名词评分的最高分降序排列，即 chunk 被命中的最高noun分数排序）

**Embedding方法表现**：
- 该关键chunk在Embedding中的排名：**#262** / 1,446（相似度0.361）
- 前10名主要是大量包含"inconscient"字眼的理论性段落，但**没有任何一个同时明确提到Pierre Janet和Freud**
- **失败原因**：
  - Pierre Janet在全书中只出现4次，embedding对罕见实体召回能力弱
  - 语义相似度偏好包含"无意识"高频词的段落，而非同时提到两位人物的对比段落

**LLM Top10在Embedding中的排名**：
`[262, 31, 383, 640, 56, 30, 316, 107, 1094, 746]`（此题是15题中表现最好的情况，仍只有3个进入Emb Top100）

### 案例2：Z2-Q4 "为什么说主体性是被建构的而非先验的？" (最差情况之一)

- LLM召回201个chunks，Top30里0个进入Emb Top100
- 说明对于高度抽象的论证型问题，向量相似度几乎和LLM筛选的关键论证段落不重合

### 案例3：Z4-Q4 "拉康派的临床技术手册在哪里可以下载？" (事实类问题)

- 这是唯一一个事实检索型问题（而非论述型），LLM召回仅14个chunks（3个高分名词），
- 覆盖率同样是0/10，说明即使是简单的事实查询，向量检索也未必能命中LLM筛出的段落。

## 结果解读

1. **系统性偏差，非个例**：15个问题里有8个（53%）LLM Top10 完全不在Embedding Top100里，
   没有一个问题的LLM Top10能全部进入Embedding Top100（最高也只3/10），
   说明这不是个别问题的偶然结果，而是两种方法在候选集合上的系统性错位。
2. **表现最好的3个问题都是"多实体对比"类问题**（Z1-Q1、Z1-Q3、Z3-Q1），
   这类问题里被比较的实体（人名、概念）本身是文中的高频/关键词，
   LLM能通过命名实体共现精确定位，Embedding也能部分捕捉到"多个关键词共现"的段落，
   所以两者重叠率相对更高，但即便如此LLM Top10命中Emb Top100的比例最高也只有30%。
3. **抽象论证类问题（Z1-Q2、Z1-Q4、Z2-Q1~Z2-Q4、Z3-Q2、Z4-Q4）全部是0/10**：
   这些问题的关键信息往往分散在具体的论证句子里，而不是集中在包含高频概念词的整段落中，
   向量相似度倾向于选出"泛泛而谈该主题"的段落，而不是"精确回应问题"的段落。
4. **原因归纳**：
   - Embedding基于整段文本的语义质心，容易被段落中的高频/主题词拉向"泛化相关"而非"精确相关"；
   - LLM Noun→Chunk方法先做名词级别的相关性判分，再反查chunk，
     能够捕捉到低频但关键的实体（如Pierre Janet、Karl Jaspers）和精确的论证句，
     不会被段落里的其他高频词稀释掉。

## 结论

在这15个问题的测试集上，**LLM Noun→Chunk方法的召回结果与Embedding方法的召回结果高度不重合**，
且重合度随着问题的抽象程度上升而下降。这个结果支持此前基于Z1-Q1单个问题得出的判断：
对于这类需要精确定位论证细节、人物对比、低频实体的学术文本问答场景，
纯向量Embedding检索不足以替代当前基于LLM名词打分的检索流程。

需要说明的局限性：
- 本实验用"LLM chunk是否进入Embedding Top100/300"作为代理指标，
  并未对Embedding Top10/30本身的内容做逐条人工判断其是否真的"不相关"，
  严谨结论仍需要对至少几个低覆盖率问题的Embedding Top10做人工抽查确认其确实答非所问。
- 测试仅基于单一文档（Guattari《Cartographies schizoanalytiques》）和单一embedding模型，
  结论不能直接推广到所有文档类型或所有embedding模型。

## 附录：完整15题数据

### 按覆盖率排序（降序）

| 排名 | 问题ID | LLM Top10 在 Emb Top100 | LLM Top30 在 Emb Top100 | LLM chunks总数 | 问题 |
|------|--------|------------------------|------------------------|---------------|------|
| 1 | Z1-Q1 | 3/10 | 6/30 | 74 | Pierre Janet和Freud对无意识的观点有何不同？ |
| 2 | Z1-Q3 | 3/10 | 3/30 | 69 | 精神分析和宗教的共同点是什么？ |
| 3 | Z3-Q1 | 3/10 | 10/30 | 92 | 比较Pierre Janet、Freud、Karl Jaspers对无意识的理解有何异同？ |
| 4 | Z4-Q3 | 2/10 | 3/30 | 112 | 请详细解释Lacan的"回到弗洛伊德"运动的具体历史过程和参与者 |
| 5 | Z3-Q3 | 1/10 | 2/30 | 76 | 从拉康的角度，欲望和需求有何区别？ |
| 6 | Z4-Q1 | 1/10 | 1/30 | 276 | Guattari对机器欲望的具体定义是什么？ |
| 7 | Z4-Q2 | 1/10 | 4/30 | 224 | 精神分析和精神分裂分析（schizoanalyse）的核心差异是什么？ |
| 8 | Z1-Q2 | 0/10 | 4/30 | 259 | 拉康精神分析如何处理主体性问题？ |
| 9 | Z1-Q4 | 0/10 | 0/30 | 15 | 分裂症和精神病之间的关系是什么？ |
| 10 | Z2-Q1 | 0/10 | 1/30 | 81 | 为什么说精神分析的阉割概念是符号性的而非生物学？ |
| 11 | Z2-Q2 | 0/10 | 2/30 | 87 | 转移（transfert）在精神分析中的功能是什么？ |
| 12 | Z2-Q3 | 0/10 | 1/30 | 198 | 拉康的三元结构（想象界、符号界、真实界）如何应用于临床？ |
| 13 | Z2-Q4 | 0/10 | 0/30 | 201 | 为什么说主体性是被建构的而非先验的？ |
| 14 | Z3-Q2 | 0/10 | 0/30 | 138 | 精神分析如何处理精神病性结构？有哪些临床策略？ |
| 15 | Z4-Q4 | 0/10 | 0/30 | 14 | 根据本文档，拉康派的临床技术手册在哪里可以下载？ |

### 统计汇总

- **问题总数**：15
- **LLM Top10 在 Emb Top100 的分布**：
  - 0个：8题 (53.3%)
  - 1个：3题 (20%)
  - 2个：1题 (6.7%)
  - 3个：3题 (20%)
- **平均覆盖率**：
  - LLM Top10 → Emb Top100：14/150 = 9.3%
  - LLM Top30 → Emb Top100：37/450 = 8.2%
- **关键结论**：即使把Embedding召回扩大到Top100（占总chunks的6.9%），
  LLM Top10命中的命中率也仅9.3%；若只看Top30，命中率不到10%。

### 问题类型与覆盖率关系

下表按 LLM Top10 在 Emb Top100 的平均覆盖率重新归类：

| 问题类型 | 样本题 | 平均命中率(Top10) | 备注 |
|---------|--------|------------------|------|
| 多实体对比型 (≥3个实体) | Z1-Q1(3/10), Z1-Q3(3/10), Z3-Q1(3/10), Z4-Q3(2/10) | 2.75/10 | 表现最好，但仍不到30% |
| 单实体概念定义型 | Z3-Q3(1/10), Z4-Q1(1/10) | 1.00/10 | - |
| 概念对比型 (2个概念) | Z4-Q2(1/10) | 1.00/10 | - |
| 抽象理论/策略/事实查询型 | Z1-Q2, Z1-Q4, Z2-Q1, Z2-Q2, Z2-Q3, Z2-Q4, Z3-Q2, Z4-Q4 | 0/10 | 全部为零命中率 |

**结论**：
- 只有"多实体对比型"问题（需要同时出现A和B两个实体的段落）体现出较高的方法间重叠（命中率2-3/10）；
- 其余11题中，有3题（单实体定义型+概念对比型）命中率为1/10，8题（抽象理论/策略/事实查询型）命中率为0/10；
- 总体看，8/15=53%的题目LLM Top10完全不在Embedding Top100里，
  **没有任何一个问题的LLM Top10能全部进入Embedding Top100**（最高也只3/10），
  说明对于这类问题，纯向量Embedding召回几乎完全错过了LLM认为关键的段落。

---

**实验脚本**：`_exp15_batch_comparison.cjs`  
**原始数据**：`_exp15_comparison_results.json`  
**执行时间**：2026-09-18

## 实验产物清单

| 序号 | 编号 | 文件名 | 用途 |
|------|------|--------|------|
| 1 | exp1 | `_exp1_check_fields.cjs` | 检查Z1-Q1 recall结果JSON的字段结构 |
| 2 | exp2 | `_exp2_embedding_recall.cjs` + `_exp2_embedding_scores.json` | 用OpenAI text-embedding-3-large对所有问题向量召回1446个chunks的Top-K |
| 3 | exp3 | `_exp3_chunk_embedding_recall.cjs` + `_exp3_chunk_scores.json` | 用chunk embedding重做检索（验证exp2的稳定性） |
| 4 | exp4 | `_exp4_keyword_analysis.cjs` | 用关键词匹配分析LLM召回chunks与Embedding召回chunks的关键词重叠情况 |
| 5 | exp5 | `_exp5_retrieval_compare.cjs` | Embedding Top10 vs LLM Top10的内容对比 + 排名映射 |
| 6 | exp6 | `_exp6_chunk_content_for_eval.cjs` + `_exp6_chunks_output.txt` | 导出待人工评估的chunks完整文本 |
| 7 | exp7 | `_exp7_manual_eval.cjs` + `_exp7_chunks_for_eval.json` | 准备人工评估用的chunk内容（按Top10顺序编号） |
| 8 | exp8 | `_exp8_auto_eval.cjs` + `_exp8_eval_results.json` | 自动评估脚本（基于内容相似度） |
| 9 | exp9 | `_exp9_detailed_comparison.cjs` | LLM Top10与Embedding Top10的逐项深度对比 |
| 10 | exp10 | `_exp10_manual_judgment.cjs` | 第二轮人工判断脚本（评估Embedding Top10是否真的不相关） |
| 11 | exp11 | `_exp11_read_and_judge.cjs` + `_exp11_output.txt` + `_exp11_my_manual_eval.md` | 第三轮人工评估记录 + 辅助输出 |
| 12 | exp12 | `_exp12_final_manual_eval.md` | 最终人工评估结论 |
| 13 | exp13 | `_exp13_fixed_chunks_for_eval.json` + `_exp13_fixed_llm_ranking.cjs` + `_exp13_print_top30.cjs` | 修正后的LLM chunk排序输出Top30 |
| 14 | exp14 | `_exp14_corrected_eval.md` | 修正后的人工评估 |
| 15 | exp15 | `_exp15_batch_comparison.cjs` + `_exp15_comparison_results.json` | **批量对比15个问题**（本报告的最终实验） |

