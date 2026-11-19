# llm-noun-recall-system 入库指南

审阅基线 [`main` 的 `2649838`](https://github.com/18926119195/llm-noun-recall-system/commit/2649838ddf83f12a946a5ce13de8e1f09ae2cb39)，2026-11-19。这里是 LLM 名词筛选与评分、拓扑扩展、chunk 去重、带引用的推理实验归档。先看 [实验总览](EXPERIMENTS_README.md) 找到问题所在阶段，再根据 [项目概览](README.md) 定位脚本。

## 可追溯开发历程

本次在默认分支全部 18 个追踪文件及其 9 月 18 日提交中检索了会话、transcript、JSONL 和实验记录，未定位到原始人机对话。时间线按实验文档重建，日期来自归档提交。若维护者能补充原始会话，应把消息时间或段落接入下表，保留当前的文档来源。[实验总览](EXPERIMENTS_README.md) · [提交记录](https://github.com/18926119195/llm-noun-recall-system/commits/main/)

| 实验阶段 | 提出的问题 | 实现和证据 |
| --- | --- | --- |
| Exp 1–15 | 采用哪种召回，在相关性与成本之间怎样取舍 | 召回脚本有两段 LLM 筛选/评分、拓扑关系和按块访问原文的实现。15 题对照档案衡量两种方法的 Top-K 重合，继续选择方案需要人工相关性标签。[召回入口](recall-nouns-llm.js) · [Embedding 对照](embedding-vs-llm-noun-retrieval-comparison.md) |
| Exp 16–24 | 将重复块归并，并确认 Top-N 阈值的代价 | 去重诊断脚本与 204 块分析已入库。204 指特定 Z1-Q1 配置下 Top 80 名词对应的历史结果，全部 240 词的块数在文档中为估算。[去重分析](_analyze_dedup.cjs) · [204 块分析](CHUNK_204_EXPLANATION.md) |
| Exp 32 | 将简洁材料与后台引用映射同时生成，让每个推理步骤可引多条材料 | 两份构建脚本在库，可用单题合成 fixture 离线验证。映射目前用页码与前 100 字符关联，存在碰撞和空 `chunkKey`。实施指南提到的推理/解析两个脚本在当前基线未收录。[构建映射](_exp32_build_prompt_with_traceback.cjs) · [生成 Prompt](_exp32_generate_multipath_prompt.cjs) · [实施说明](_exp32_README.md) |
| Exp 34 | 检查 15 题范围的召回与推理效果 | 报告及两份 JSON 留有历史产出；报告记录 15/15 生成成功、754,214 token。成功率衡量生成完成，质量仍需按每题证据单独判定。[报告](_exp34_evaluation_report.md) · [归档样本](_exp34_evaluation_dataset_complete.json) · [推理数据](_exp34_all_reasoning_output.json) |

## 运行边界

- **在线召回输入**需要获授权的 `DOCUVERSE_PATH`、`NOUN_INDEX_PATH`、`QUESTIONS_PATH`、模型配置和密钥。这三份实际输入在本库基线缺失，代码中的本机 Windows 路径只是历史默认值。配置 `OUTPUT_PATH` 到隔离目录，先以 `QUESTION_IDS=Z1-Q1` 限制题目。
- **离线入门**先在 Node 24 跑 `node --check recall-nouns-llm.js` 和两份 Exp32 脚本的语法检查。要验证数据链路，把两份 Exp32 脚本复制到临时目录，接入最小的 `noun-recall-results-Z1Q1.json`、`topology-chains.json` 和 `candidate-texts-deduped.json`。审阅已用一条虚构法语材料验证生成的 Prompt 含 `【【1】】`，映射同号回到 fixture 的 `chunkKey`。[双输出输入约定](_exp32_README.md)

## 开发和验收闭环

1. **恢复可复现输入。** 维护者确认授权语料和候选格式，落下可公开的最小 fixture、输入哈希及版本映射。先验同一数据重复执行时，去重 ID 和映射稳定。
2. **修复引用定位。** 构造同页正文前缀相同、不同块 ID 以及块缺失三种样例，令稳定 `chunkKey` 随候选传递。建议门槛是有引用的材料 100% 映射准确，缺块在结果中显式可查；碰撞时停止后续推理并追至材料生成阶段。
3. **区分检索与推理指标。** 在同一题集标注相关 chunk 和不可回答题，比较名词 Top-N、去重率、Precision/Recall@K、引用准确率、空回答与成本。模型波动、阈值变化、同页材料碰撞都要进入报告。维护者在发出在线请求前批准题数与费用，并根据同版标注选择阈值。
4. **形成下次的 Agent 上下文。** 保存取得输入的授权范围、实验配置、聚合结果和两类失败样本。用看得见的原文证据作为判断依据，手动复核不可回答题后再扩大样本。

## 方法依据

本指南把总体设计落实为边界、目标和任务接口，把工程控制中的反馈落实为观测、判据和纠偏。维护者用原始协作记录、代码和固定样本共同核验定性判断与量化结果，据此决定下一轮行动。[《工程控制论》](https://openlibrary.org/books/OL49218199M/Engineering_cybernetics) · [《组织管理的技术——系统工程》](https://doi.org/10.13255/j.cnki.jusst.2011.06.020) · [《一个科学新领域——开放的复杂巨系统及其方法论》](https://cnki.istiz.org.cn/kcms/detail/detail.aspx?dbcode=CPFD&dbname=cpfd1999&filename=ZGXC199008001001)
