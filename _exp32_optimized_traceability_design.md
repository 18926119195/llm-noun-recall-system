# Exp32 优化方案：多材料推理 + 后台溯源映射

## 问题分析

用户提出的两个核心需求：
1. **推理步骤应该支持引用多个材料**（当前只支持单个）
2. **chunkKey应该保留用于溯源，但不能塞进LLM的Prompt**

---

## 🎯 设计目标

### 目标1：多材料推理
**支持场景**：
- **对比论证**：对比【【1】】和【【3】】中Janet与Freud的不同表述
- **交叉验证**：【【2】】【【5】】【【7】】都提到"无意识的结构性"，形成互证
- **综合支撑**：从【【4】】【【6】】【【9】】综合提取Freud的拓扑学划分特征

### 目标2：后台溯源
**关键原则**：
- ✅ LLM只看到简洁的【【N】】编号和文本内容
- ✅ 溯源映射表在后台维护
- ✅ 输出时自动注入溯源信息

---

## 📐 架构设计

### 数据流

```
原始数据 (topology-chains.json)
    ↓
去重 + 构建映射表
    ↓
├─→ LLM Prompt (candidate-texts-deduped.json)
│     材料：
│     【【1】】(页码: 130, 名词命中数: 19)
│     dérez, par exemple, les ritournelles...
│
└─→ 溯源映射表 (material-traceback-map.json)
      {
        "1": {
          "chunkKey": "h1.GhGfBpguYOKr...",
          "page": 130,
          "nounCount": 19,
          "hits": [
            {"noun": "Pierre Janet", "start": 447254, "end": 447266}
          ]
        }
      }
```

### 推理输出

```json
{
  "paths": [
    {
      "name": "路径一：认识论定位",
      "steps": [
        {
          "materials": [1, 14],  // ← 支持多个材料
          "reasoning": "综合【【1】】【【14】】，对比Janet的'automatismes psychologiques'与Freud的'inconscient fantasmatique'...",
          "conclusion": "Janet强调被动性，Freud强调主动生成"
        }
      ]
    }
  ]
}
```

### 溯源查询

```javascript
function traceback(materialId) {
  const map = require('./material-traceback-map.json');
  const entry = map[materialId];
  return {
    materialId,
    chunkKey: entry.chunkKey,
    page: entry.page,
    hits: entry.hits.map(h => ({
      noun: h.noun,
      location: `corpus.txt[${h.start}:${h.end}]`,
      context: corpus.substring(h.start - 50, h.end + 50)
    }))
  };
}
```

---

## 🛠️ 实施方案

### Step 1: 修改去重脚本，生成双输出

**文件**: `_exp32_build_prompt_with_traceback.cjs`

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// 读取数据
const topologyChains = JSON.parse(fs.readFileSync('topology-chains.json', 'utf8'));
const z1q1 = JSON.parse(fs.readFileSync('noun-recall-results-Z1Q1.json', 'utf8'))[0];

// 去重逻辑（假设已有）
const uniqueChunks = deduplicateChunks(topologyChains.chains);

// 输出1: LLM Prompt（不含chunkKey）
const promptChunks = uniqueChunks.map((chunk, idx) => ({
  id: idx + 1,
  page: chunk.page,
  nounCount: chunk.nounCount,
  text: chunk.text
}));

// 输出2: 溯源映射表（含chunkKey和hits）
const tracebackMap = {};
uniqueChunks.forEach((chunk, idx) => {
  tracebackMap[idx + 1] = {
    chunkKey: chunk.chunkKey,
    page: chunk.page,
    nounCount: chunk.nounCount,
    minThresholdSelected: chunk.minThresholdSelected,
    hits: chunk.hits // 保留所有命中的名词及其偏移量
  };
});

// 保存
fs.writeFileSync('candidate-texts-for-llm.json', JSON.stringify(promptChunks, null, 2));
fs.writeFileSync('material-traceback-map.json', JSON.stringify(tracebackMap, null, 2));

console.log(`✅ 生成${uniqueChunks.length}个材料`);
console.log(`✅ LLM输入: candidate-texts-for-llm.json`);
console.log(`✅ 溯源映射: material-traceback-map.json`);
```

---

### Step 2: 修改Prompt模板，支持多材料引用

**文件**: `_exp32_multipath_prompt_template.txt`

```
问题：${question}

材料：

【【1】】(页码: 130, 名词命中数: 19)
dérez, par exemple, les ritournelles...

【【2】】(页码: 97, 名词命中数: 18)
Il est vrai que les dadaistes...

...

---

要求：从 2-4 个不同角度分析问题，输出多条独立推理路径。

每条路径必须：
1. 有独特的分析视角（不重复其他路径）
2. 包含多个推理步骤，每步可以引用**一个或多个**材料
3. 结尾有该路径的初步结论

格式：

# 路径一：[路径名]
思路：[1句话说明角度]

步骤1：使用【【X】】，提取...，判断...
步骤2：综合【【Y】】【【Z】】，对比...，发现...
步骤3：结合【【X】】【【W】】，交叉验证...

结论：[本路径的初步结论]

# 路径二：[路径名]
思路：[不同角度]

步骤1：综合【【A】】【【B】】【【C】】，从三个来源提取...
步骤2：使用【【D】】，验证...

结论：...

（继续路径三、四...）

# 综合结论
[整合所有路径，给出问题最终答案]

---

**引用规范**：
- 单个材料：使用【【N】】，提取...
- 多个材料：综合【【N】】【【M】】【【K】】，对比/交叉验证/综合提取...
- 引用必须有明确的文本依据和推理逻辑
```

---

### Step 3: LLM输出解析 + 溯源注入

**文件**: `_exp32_parse_and_inject_traceback.cjs`

```javascript
#!/usr/bin/env node
const fs = require('fs');

// 读取LLM输出
const llmOutput = fs.readFileSync('_exp32_llm_output.txt', 'utf8');

// 读取溯源映射
const tracebackMap = JSON.parse(fs.readFileSync('material-traceback-map.json', 'utf8'));

// 解析引用的材料编号
const materialPattern = /【【(\d+)】】/g;
const usedMaterials = new Set();
let match;
while ((match = materialPattern.exec(llmOutput)) !== null) {
  usedMaterials.add(parseInt(match[1]));
}

// 生成溯源报告
const tracebackReport = {
  totalMaterialsUsed: usedMaterials.size,
  materials: {}
};

for (const materialId of usedMaterials) {
  const entry = tracebackMap[materialId];
  tracebackReport.materials[materialId] = {
    chunkKey: entry.chunkKey,
    page: entry.page,
    nounCount: entry.nounCount,
    exactHits: entry.hits.map(h => ({
      noun: h.noun,
      startOffset: h.start,
      endOffset: h.end,
      // 如果有原文corpus，可以提取上下文
      // context: corpus.substring(h.start - 50, h.end + 50)
    }))
  };
}

// 保存带溯源的完整报告
fs.writeFileSync('_exp32_reasoning_with_traceback.json', JSON.stringify({
  llmOutput: llmOutput,
  traceback: tracebackReport
}, null, 2));

console.log(`✅ 引用了${usedMaterials.size}个材料`);
console.log(`✅ 每个材料都有chunkKey和精确偏移量`);
console.log(`✅ 完整报告: _exp32_reasoning_with_traceback.json`);
```

---

## 📊 效果对比

### 当前方案（Exp30）

**Prompt**:
```
【【1】】(页码: 130, 名词命中数: 19)
dérez, par exemple, les ritournelles...
```

**推理**:
```
步骤1：使用【【1】】，提取"les ritournelles symptomatiques..."
步骤2：使用【【5】】，提取"se trouver pris en sandwich..."
```

**问题**:
- ❌ 每步只能引用一个材料
- ❌ 无法进行对比论证
- ❌ 缺少chunkKey，无法精确溯源

---

### 优化方案（Exp32）

**Prompt**（不变，但指令更新）:
```
【【1】】(页码: 130, 名词命中数: 19)
dérez, par exemple, les ritournelles...
```

**推理**（支持多材料）:
```
步骤1：综合【【1】】【【14】】，对比两处对Janet的描述，
       发现都强调"automatismes psychologiques"的被动性

步骤2：结合【【3】】【【13】】【【15】】，三处文本互证Freud的
       "符号生成性"特征

步骤3：使用【【5】】，验证Freud的"processus primaire"
```

**溯源**（后台映射）:
```json
{
  "materials": {
    "1": {
      "chunkKey": "h1.GhGfBpguYOKr...",
      "page": 130,
      "exactHits": [
        {
          "noun": "Pierre Janet",
          "startOffset": 447254,
          "endOffset": 447266
        }
      ]
    },
    "14": {
      "chunkKey": "h1.XyZ123...",
      "page": 130,
      "exactHits": [...]
    }
  }
}
```

---

## 🎯 优势总结

### 1. 推理质量提升

| 维度 | 单材料 | 多材料 |
|-----|--------|--------|
| **对比论证** | ❌ 无法对比 | ✅ 综合【【1】】【【3】】对比 |
| **交叉验证** | ❌ 孤立引用 | ✅ 【【2】】【【5】】【【7】】互证 |
| **综合支撑** | ❌ 单一来源 | ✅ 从多处提取一致特征 |
| **论证深度** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### 2. 溯源能力

| 层级 | 当前 | 优化后 |
|-----|------|--------|
| 【【N】】→ chunk文本 | ✅ | ✅ |
| chunk → chunkKey | ❌ 缺失 | ✅ 后台映射 |
| chunkKey → 精确偏移 | ❌ | ✅ hits[].start/end |
| 溯源唯一性 | ⚠️ 模糊 | ✅ 绝对唯一 |

### 3. Prompt简洁性

| 元素 | 是否放入LLM | 说明 |
|-----|------------|------|
| 材料编号【【N】】 | ✅ | 必需，用于引用 |
| 页码、名词数 | ✅ | 辅助信息，帮助LLM判断 |
| 文本内容 | ✅ | 核心材料 |
| **chunkKey** | ❌ | **后台映射，不污染Prompt** |
| **hits偏移量** | ❌ | **后台保留，用于溯源** |

---

## 💡 实施步骤

### 第一步：修改去重脚本（今天）
```bash
node _exp32_build_prompt_with_traceback.cjs
# 输出：
#   candidate-texts-for-llm.json (给LLM)
#   material-traceback-map.json (后台映射)
```

### 第二步：更新Prompt模板（今天）
- 在指令中明确：**可以引用多个材料**
- 给出多材料引用的格式示例

### 第三步：测试LLM推理（今天）
- 跑一遍新的Prompt
- 观察LLM是否会主动使用多材料引用

### 第四步：构建溯源工具（明天）
- 解析LLM输出中的【【N】】
- 查询material-traceback-map.json
- 生成完整的溯源报告

---

## 🔬 验证标准

### 推理质量验证
- ✅ 至少有一个步骤引用了2个以上材料
- ✅ 多材料引用有明确的逻辑关系（对比/互证/综合）
- ✅ 综合结论整合了多条路径

### 溯源验证
```javascript
// 对于输出中的任意【【N】】
const traceback = tracebackTool(N);

// 应该能够：
1. 找到唯一的chunkKey
2. 定位到原文的精确字符偏移
3. 列出该chunk中所有命中的名词
4. 每个名词都有start/end偏移量
```

---

## 📋 下一步

1. **立即实施**：写`_exp32_build_prompt_with_traceback.cjs`
2. **测试效果**：用新Prompt跑一次LLM，看是否主动使用多材料引用
3. **构建工具**：写溯源查询脚本`_exp32_traceback_tool.cjs`
4. **验证完整性**：确保【【N】】→原文的链路畅通

要现在开始写第一步脚本吗？
