# 智能白板功能实现说明

## 概述

实现了基于 AI 对话的智能白板功能，能够自动从对话中提取结构化信息，并根据当前阶段实时更新白板内容。

---

## 核心功能

### 1. 自动信息提取
- AI 根据对话内容自动提取结构化信息
- 根据当前阶段返回对应的字段
- 严格 JSON 格式输出，无多余文本

### 2. 实时更新
- 每次 AI 回复后自动调用 `/api/analyze`
- 1 秒 debounce 避免频繁请求
- 白板数据实时同步到界面

### 3. 阶段感知
- 不同阶段显示不同的信息卡片
- 阶段切换时保留历史数据
- 新阶段数据自动追加，不覆盖旧数据

---

## 文件结构

### 1. `/app/api/analyze/route.ts`（后端 API）

**功能**：解析对话内容，返回结构化白板数据

**接受的参数**：
```typescript
{
  "messages": [
    { "role": "user" | "assistant", "content": "..." }
  ],
  "userStage": "career_planning" | "project_review" | ...
}
```

**返回的数据结构**（根据阶段不同）：
- `career_planning`: `{ intentRole, keySkills }`
- `project_review`: `{ starProjects }`
- `resume_optimization`: `{ resumeInsights }`
- `interview`: `{ interviewReports }`
- `application_strategy`: `{ targetCompanies }`
- `salary_talk`: `{ salaryStrategy }`
- `offer`: `{ offers }`

**核心特性**：
- 根据 `userStage` 构建不同的 prompt
- 严格要求 JSON 格式输出
- 自动为数组项添加 ID
- 字段缺失时不返回或设为 null/空数组

---

### 2. `/components/Whiteboard.tsx`（前端组件）

**功能**：根据白板数据渲染对应的卡片

**支持的卡片类型**：
1. **意向岗位卡片**（career_planning）
   - 显示用户的目标岗位

2. **核心技能卡片**（career_planning）
   - 技能标签列表

3. **STAR 项目卡片**（project_review）
   - 项目标题、背景、成果预览
   - 点击跳转到详情页

4. **简历优化建议卡片**（resume_optimization）
   - 原句 vs 优化句对比
   - 优化建议说明

5. **面试报告卡片**（interview）
   - 轮次、总分、问题数量
   - 点击跳转到详情页

6. **目标公司卡片**（application_strategy）
   - 公司名称、岗位、匹配度

7. **薪资策略卡片**（salary_talk）
   - 目标范围、谈判要点

8. **Offer 列表卡片**（offer）
   - 公司、岗位、薪资

**动画效果**：
- 使用 Framer Motion 实现卡片出现动画
- 新卡片从左侧滑入并淡入

---

### 3. `/app/chat/page.tsx`（主对话组件）

**核心逻辑**：

1. **状态管理**：
   ```typescript
   const [whiteboardData, setWhiteboardData] = useState<WhiteboardData>({});
   ```

2. **自动分析**：
   - 每次 AI 回复后调用 `debouncedAnalyze()`
   - 1 秒 debounce 避免频繁请求
   - 传递所有消息和当前阶段到 API

3. **数据合并**：
   - 数组字段：追加新项，避免重复（基于 ID）
   - 非数组字段：直接覆盖

4. **持久化**：
   - 自动保存到 `localStorage`
   - 页面刷新后自动恢复

---

## 阶段对应的字段

| 阶段 | 字段 | 说明 |
|------|------|------|
| `career_planning` | `intentRole` | 意向岗位 |
| | `keySkills` | 核心技能数组 |
| `project_review` | `starProjects` | STAR 项目数组 |
| `resume_optimization` | `resumeInsights` | 简历优化建议数组 |
| `interview` | `interviewReports` | 面试报告数组 |
| `application_strategy` | `targetCompanies` | 目标公司数组 |
| `salary_talk` | `salaryStrategy` | 薪资策略对象 |
| `offer` | `offers` | Offer 列表数组 |

---

## 数据流

```
用户发送消息
  ↓
调用 /api/chat 获取 AI 回复
  ↓
显示 AI 回复
  ↓
调用 debouncedAnalyze()（1秒后）
  ↓
调用 /api/analyze
  ↓
AI 分析对话，返回结构化数据
  ↓
合并到 whiteboardData
  ↓
Whiteboard 组件自动更新
  ↓
保存到 localStorage
```

---

## 详情页路由

### 1. `/app/chat/project/[id]/page.tsx`
- 显示完整的 STAR 项目详情
- 从 localStorage 读取项目数据

### 2. `/app/chat/interview-report/[id]/page.tsx`
- 显示完整的面试报告
- 包含所有问题、回答、反馈、评分
- 显示优点和改进建议

---

## 使用示例

### 示例 1：职业规划阶段
```
用户："我的岗位是产品经理"
  ↓
AI 回复："好的，产品经理需要..."
  ↓
白板自动显示：
  - 求职岗位：产品经理
```

### 示例 2：项目梳理阶段
```
用户："我做过一个电商系统，负责前端开发..."
  ↓
AI 回复："能详细说说这个项目的背景吗？"
  ↓
用户："项目背景是..."
  ↓
白板自动新增项目卡片：
  - 项目名称：电商系统
  - 背景：...
  - 点击可查看详情
```

### 示例 3：简历优化阶段
```
用户："我的简历上写的是：负责前端开发"
  ↓
AI 回复："可以优化为：独立负责前端架构设计..."
  ↓
白板自动显示优化建议：
  - 原句：负责前端开发
  - 优化：独立负责前端架构设计...
```

### 示例 4：面试阶段
```
用户完成一轮面试
  ↓
AI 生成面试报告
  ↓
白板自动新增面试报告卡片：
  - 轮次：第一轮：技术面试
  - 总分：85
  - 点击可查看详情
```

---

## 测试验证

### 1. 测试自动提取
```javascript
// 在浏览器控制台
// 发送消息后，查看白板是否自动更新
console.log(window.whiteboardData);
```

### 2. 测试手动设置
```javascript
// 手动设置白板数据
window.setWhiteboardData({
  intentRole: "产品经理",
  keySkills: ["React", "TypeScript"]
});
```

### 3. 测试 API
```javascript
fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: "user", content: "我的岗位是产品经理" }
    ],
    userStage: "career_planning"
  })
})
.then(r => r.json())
.then(data => console.log(data));
```

---

## 注意事项

1. **数据持久化**：
   - 白板数据自动保存到 `localStorage`
   - 页面刷新后自动恢复

2. **数据合并策略**：
   - 数组字段：追加新项，基于 ID 去重
   - 非数组字段：直接覆盖

3. **阶段切换**：
   - 进入新阶段时不清空旧数据
   - 新阶段的数据会追加到白板

4. **性能优化**：
   - 使用 debounce 避免频繁请求
   - 只在有新消息时触发分析

5. **错误处理**：
   - API 失败时不影响对话流程
   - 白板数据缺失时显示空状态

---

## 未来扩展

1. **编辑功能**：允许用户手动编辑白板内容
2. **导出功能**：导出白板数据为 PDF/Word
3. **分享功能**：分享白板内容给他人
4. **历史记录**：查看白板数据的历史版本
5. **搜索功能**：在白板内容中搜索关键词

---

## 文件清单

- ✅ `/app/api/analyze/route.ts` - 分析 API（已重写）
- ✅ `/components/Whiteboard.tsx` - 白板组件（新建）
- ✅ `/app/chat/page.tsx` - 主对话组件（已更新）
- ✅ `/app/chat/project/[id]/page.tsx` - 项目详情页（新建）
- ✅ `/app/chat/interview-report/[id]/page.tsx` - 面试报告详情页（新建）

---

## 验证清单

- [x] API 根据阶段返回不同字段
- [x] 白板组件根据数据渲染卡片
- [x] 自动分析对话并更新白板
- [x] 数据持久化到 localStorage
- [x] 项目卡片可点击查看详情
- [x] 面试报告可点击查看详情
- [x] 动画效果正常
- [x] 阶段切换时数据保留
- [x] 新数据自动追加，不覆盖

