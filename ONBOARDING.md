# llm-noun-recall-system 入库指南

[一分钟定位](#一分钟定位) · [沿聊天时间线看灵感](#沿聊天时间线看灵感) · [从代码反查来由](#从代码反查来由) · [走读与维护记录](#走读与维护记录)

## 一分钟定位

这是一次 LLM 名词检索和引用推理实验的留档。从 [`recall-nouns-llm.js`](recall-nouns-llm.js) 看两段评分与拓扑召回，从 [Exp32 说明](_exp32_README.md) 看展示用材料与后台引用映射，从 [Exp34 报告](_exp34_evaluation_report.md) 看 15 题历史输出。以下状态以 [`main @ 2649838`](https://github.com/18926119195/llm-noun-recall-system/commit/2649838ddf83f12a946a5ce13de8e1f09ae2cb39) 为准。

根目录只有 18 个跟踪文件。在线召回所需的 Docuverse 原文、终词表与题库没有一并保存在这个版本。Exp32 两个脚本、Exp34 两份结果 JSON、早期实验说明是不同层次的证据。[文件地图](README.md)

借用钱学森工程控制论的观察与反馈思路，先按实验想回答的问题定位，再用版本化代码和产物核查。发现描述与代码不同，就保留两边的出处和适用范围。

## 沿聊天时间线看灵感

**如何读状态。** 已实现表示在所列版本找到与灵感相符的代码路径。部分实现表示已有其中一段。未实现表示已查的入口尚无对应实现。证据不足时标待确认。归档与设计文稿按资料本身的状态描述。

在默认分支文件与可见提交中未找到原始人机对话。下表以 [实验总览](EXPERIMENTS_README.md) 的实验顺序回溯构想，所有可见的相关提交归档于 2026-09-18。实验编号能标示先后，原始提出者、消息时间及未收录的会话出处仍待证实。[提交历史](https://github.com/18926119195/llm-noun-recall-system/commits/main/)

| ID | 实验记录位置 | 可追溯的构想 | 当前状态 | 实现证据 |
| --- | --- | --- | --- | --- |
| <a name="idea-i01"></a>I01 | Exp 1–15，Embedding 基线及召回质量对照 | 把按名词评分后沿拓扑取块和向量召回在同题上比较。 [对照报告](embedding-vs-llm-noun-retrieval-comparison.md) | 有实验与一侧代码 | 召回脚本有 LLM 粗筛、精打和按块取文逻辑。对照报告保存两种方法的 Top-K 重合，向量端运行入口未见于此快照。 [召回脚本](recall-nouns-llm.js#L382) |
| <a name="idea-i02"></a>I02 | Exp 16–17，阈值优化 | 在固定分数和固定 Top-N 之间找合适截断点。 [实验总览](EXPERIMENTS_README.md) | 部分落地 | 当前脚本直接按 `TOP_N` 排序截断，默认 100。实验文档记录过 score ≥ 95 或 Top 10–15 两种候选设置。 [参数](recall-nouns-llm.js#L37) · [截断](recall-nouns-llm.js#L518) |
| <a name="idea-i03"></a>I03 | Exp 18–24，去重试验 | 多个名词召回到同一块时只保留一份。 [204 块说明](CHUNK_204_EXPLANATION.md) | 已实现 | 主脚本将 `recalledBookKeys` 存为 Set。204 是 Z1-Q1 特定 Top 80 的历史统计，当前默认值与该试验设置不同。 [Set 去重](recall-nouns-llm.js#L521) |
| <a name="idea-i04"></a>I04 | Exp 32，双输出与多材料引用 | 给模型简洁材料，另存材料 ID 到 chunk 的映射，同一步可以引用多个材料。 [设计记录](_exp32_optimized_traceability_design.md) | 已实现构建部分 | 两份脚本生成映射和 Prompt；离线合成样本可让 `【【1】】` 回到其 `chunkKey`。映射键为页码加正文前 100 字符，有冲突或空键的可能。 [映射构建](_exp32_build_prompt_with_traceback.cjs) · [Prompt 生成](_exp32_generate_multipath_prompt.cjs) |
| <a name="idea-i05"></a>I05 | Exp 32，实施说明步骤 3–4 | 调用模型后解析引用，再将原文来源映射回推理结果。 [实施说明](_exp32_README.md) | 在本库未找到完整落地 | 说明点名的 `_exp32_test_multipath_reasoning.cjs` 与 `_exp32_parse_and_inject_traceback.cjs` 都不在当前树中。本库有构建脚本和设计记录。 [该版本内容](https://github.com/18926119195/llm-noun-recall-system/tree/2649838ddf83f12a946a5ce13de8e1f09ae2cb39) |
| <a name="idea-i06"></a>I06 | Exp 34，15 题推理评测 | 保存整批推理回答与调用规模，方便比较覆盖与费用。 | 已有归档结果 | 报告记录 15/15 生成完成，结果有两份 JSON。生成完成与答复质量可从报告的不同字段回查。 [评测报告](_exp34_evaluation_report.md) · [结果数据](_exp34_all_reasoning_output.json) |

## 从代码反查来由

| 当前文件或入口 | 回到构想 | 走读重点 |
| --- | --- | --- |
| [`recall-nouns-llm.js`](recall-nouns-llm.js#L518) | [I01](#idea-i01)–[I03](#idea-i03) | 分数用于排序，Top-N 决定哪些词参与扩展，Set 控制同一块的重复加入。 |
| [`_exp32_build_prompt_with_traceback.cjs`](_exp32_build_prompt_with_traceback.cjs) | [I04](#idea-i04)、[I05](#idea-i05) | 分清模型材料与内部溯源映射；样本能验证脚本生成的部分。 |
| [`_exp34_evaluation_dataset_complete.json`](_exp34_evaluation_dataset_complete.json) | [I06](#idea-i06) | 这是既有评测归档，可用来理解记录字段与历次实验口径。 |

## 走读与维护记录

从 `recalledBookKeys` 的 Set 查到 [I03](#idea-i03)，再打开 [204 块说明](CHUNK_204_EXPLANATION.md)。读完应能解释 204 是什么、为什么它依赖 Z1-Q1 与 Top 80，以及词项去重和材料块去重有什么区别。找到原始会话后，在对应条目补消息时间和脱敏定位；若出现其它代码版本，写清变更是否解释了实验文档与默认值的差异。

**指南如何更新。** 以仓库和版本划定范围，从聊天提取原始目标，再用代码与产物校正对当时决策的理解。新证据出现时，回到原编号修订记录。这种读法借鉴了钱学森的系统工程和工程控制论。 [《组织管理的技术——系统工程》](https://doi.org/10.13255/j.cnki.jusst.2011.06.020) · [《工程控制论》](https://openlibrary.org/books/OL49218199M/Engineering_cybernetics)
