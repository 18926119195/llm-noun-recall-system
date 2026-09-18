# Exp32 实施指南

## 📋 快速开始

已创建的脚本文件：

### 1. `_exp32_build_prompt_with_traceback.cjs`
**功能**：从 topology-chains.json 和 candidate-texts-deduped.json 生成双输出
- 输出1: `candidate-texts-for-llm.json` (简洁版，给LLM)
- 输出2: `material-traceback-map.json` (后台溯源映射表)

**运行**：
```powershell
node _exp32_build_prompt_with_traceback.cjs
```

---

### 2. `_exp32_generate_multipath_prompt.cjs`
**功能**：从 candidate-texts-for-llm.json 生成支持多材料引用的Prompt
- 输出: `_exp32_multipath_prompt.txt`

**运行**：
```powershell
node _exp32_generate_multipath_prompt.cjs
```

---

### 3. `_exp32_test_multipath_reasoning.cjs`
**功能**：调用LLM API进行多路径推理测试
- 输入: `_exp32_multipath_prompt.txt`
- 输出: `_exp32_llm_output.json` 和 `_exp32_llm_output.txt`

**前置要求**：设置API密钥
```powershell
$env:DEEPSEEK_API_KEY = "your-api-key-here"
```

**运行**：
```powershell
node _exp32_test_multipath_reasoning.cjs
```

---

### 4. `_exp32_parse_and_inject_traceback.cjs`
**功能**：解析LLM输出并注入溯源信息
- 输入: `_exp32_llm_output.json` + `material-traceback-map.json`
- 输出: `_exp32_reasoning_with_traceback.json`

**运行**：
```powershell
node _exp32_parse_and_inject_traceback.cjs
```

---

## 🎯 完整工作流

```powershell
# Step 1: 构建双输出（LLM用 + 溯源映射）
node _exp32_build_prompt_with_traceback.cjs

# Step 2: 生成支持多材料引用的Prompt
node _exp32_generate_multipath_prompt.cjs

# Step 3: 设置API密钥（首次需要）
$env:DEEPSEEK_API_KEY = "sk-your-api-key"

# Step 4: 调用LLM进行推理
node _exp32_test_multipath_reasoning.cjs

# Step 5: 解析输出并生成溯源报告
node _exp32_parse_and_inject_traceback.cjs
```

---

## 📊 预期输出文件

| 文件 | 说明 | 用途 |
|------|------|------|
| `candidate-texts-for-llm.json` | 简洁版材料列表 | 给LLM的输入 |
| `material-traceback-map.json` | 后台溯源映射表 | chunkKey + hits偏移 |
| `_exp32_multipath_prompt.txt` | 完整Prompt | LLM请求内容 |
| `_exp32_llm_output.json` | LLM输出+元数据 | 推理结果（JSON） |
| `_exp32_llm_output.txt` | LLM输出纯文本 | 推理结果（文本） |
| `_exp32_reasoning_with_traceback.json` | 推理+溯源完整报告 | 最终成果 |

---

## 🔬 验证要点

### 1. LLM是否使用多材料引用？
检查 `_exp32_llm_output.json` 中的 `metadata.multiMaterialSteps`：
- `> 0`：✅ 成功，LLM主动使用了多材料引用
- `= 0`：⚠️ 未使用，需要调整prompt

### 2. 溯源链路是否完整？
检查 `_exp32_reasoning_with_traceback.json` 中的 `tracebackStatus.successRate`：
- `100%`：✅ 完美，所有材料都有chunkKey
- `< 100%`：⚠️ 部分材料缺少chunkKey（可能是映射问题）

### 3. 能否从【【N】】追溯到原文？
查看 `_exp32_reasoning_with_traceback.json` 中的任意材料：
```json
{
  "materials": {
    "1": {
      "chunkKey": "h1.GhGfBpgu...",
      "page": 130,
      "exactHits": [
        {
          "noun": "Pierre Janet",
          "startOffset": 447254,
          "endOffset": 447266
        }
      ]
    }
  }
}
```

如果有 `chunkKey` 和 `startOffset/endOffset`，则溯源链路完整 ✅

---

## 💡 优化建议

### 如果LLM未使用多材料引用

**方法1**：在Prompt中添加更强烈的示例
```
例如：
步骤1：综合【【1】】【【5】】【【10】】，从三处材料中提取Freud对无意识的描述，
       发现都强调"动力性"特征...
```

**方法2**：在系统消息中强调
```javascript
messages: [
  {
    role: 'system',
    content: '你擅长从多个材料中进行对比论证和交叉验证。当多个材料支撑同一论点时，你会同时引用它们。'
  },
  {
    role: 'user',
    content: prompt
  }
]
```

### 如果溯源成功率不高

检查 `_exp32_build_prompt_with_traceback.cjs` 中的映射逻辑：
- 当前用 `page + text前100字符` 作为key
- 如果OCR噪声大，可能需要更鲁棒的匹配策略
- 建议在 `candidate-texts-deduped.json` 生成时就保留 `chunkKey`

---

## 🎉 核心成果

完成Exp32后，你将拥有：

1. ✅ **简洁的LLM输入**：不含chunkKey等内部标识
2. ✅ **完整的溯源映射**：后台保存所有chunkKey和精确偏移
3. ✅ **多材料推理能力**：支持对比论证、交叉验证、综合支撑
4. ✅ **绝对唯一的溯源链路**：从【【N】】→原文精确字符位置

---

## 🚀 下一步扩展

### 扩展1：溯源查询工具
```javascript
// _exp32_traceback_tool.cjs
function traceback(materialId) {
  const map = require('./material-traceback-map.json');
  const corpus = fs.readFileSync('corpus.txt', 'utf8');
  
  const entry = map['Z1-Q1'].materials[materialId];
  return entry.exactHits.map(h => ({
    noun: h.noun,
    location: `[${h.startOffset}:${h.endOffset}]`,
    context: corpus.substring(h.startOffset - 100, h.endOffset + 100)
  }));
}
```

### 扩展2：自动验证脚本
验证每个【【N】】引用的文本内容是否真的在材料中：
```javascript
function validateCitations(llmOutput, materials) {
  // 提取LLM声称引用的文本片段
  // 在对应的材料中搜索
  // 报告是否存在幻觉引用
}
```

### 扩展3：批量处理
将流程应用到所有问题（不只是Z1-Q1）

---

## 📖 相关文档

- `_exp30_material_traceability_analysis.md`：溯源能力分析
- `_exp32_optimized_traceability_design.md`：详细设计文档
- `_exp30_complete_input_output.md`：Exp30的基准测试结果
