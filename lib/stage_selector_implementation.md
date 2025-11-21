# 阶段选择功能实现说明

## 概述

实现了阶段选择功能，用户可以通过返回按钮进入阶段选择页面，查看所有流程节点，选择进入任意阶段，并且 AI 会保存所有阶段的聊天记录作为上下文。

---

## 核心功能

### 1. 返回按钮功能
- 点击左上角返回按钮 → 显示阶段选择页面
- 不再直接回退到上一个阶段

### 2. 阶段选择页面
- 显示所有 7 个流程节点
- 已完成的阶段特殊标记（绿色边框，✓ 标记）
- 当前阶段特殊标记（蓝色边框，→ 标记）
- 待开始阶段（灰色边框）

### 3. 阶段切换
- 点击任意阶段 → 进入该阶段的聊天
- 自动加载该阶段的聊天记录
- 保存当前阶段的聊天记录

### 4. 聊天记录管理
- 每个阶段的聊天记录独立保存
- 切换阶段时自动保存和加载
- AI 调用时传递所有阶段的聊天记录作为上下文

---

## 文件结构

### 1. `/components/StageSelector.tsx`（新建）

**功能**：阶段选择页面组件

**特性**：
- 显示所有 7 个阶段（职业规划、项目梳理、简历优化、投递策略、模拟面试、薪资沟通、Offer）
- 自动检测已完成的阶段（基于白板数据和聊天记录）
- 标记当前阶段和已完成阶段
- 点击阶段卡片进入该阶段的聊天

**判断完成标准**：
- 白板数据中有对应字段
- 聊天记录中有该阶段的消息

---

### 2. `/app/chat/page.tsx`（已修改）

**新增功能**：

1. **阶段选择器状态**：
   ```typescript
   const [showStageSelector, setShowStageSelector] = useState(false);
   ```

2. **保存聊天记录**：
   ```typescript
   const saveStageChatHistory = (stage: UserStage, chatMessages: Message[])
   ```
   - 保存到 `localStorage` 的 `ajc_chatHistory`
   - 格式：`{ [stage]: Message[] }`

3. **加载聊天记录**：
   ```typescript
   const loadStageChatHistory = (stage: UserStage)
   ```
   - 从 `localStorage` 读取指定阶段的聊天记录
   - 恢复消息列表

4. **返回按钮处理**：
   ```typescript
   const handleBack = () => {
     saveStageChatHistory(userStage, messages);
     setShowStageSelector(true);
   };
   ```

5. **阶段选择处理**：
   ```typescript
   const handleSelectStage = (stage: UserStage) => {
     saveStageChatHistory(userStage, messages); // 保存当前阶段
     setUserStage(stage); // 切换阶段
     loadStageChatHistory(stage); // 加载新阶段
     setShowStageSelector(false);
   };
   ```

6. **API 调用时传递所有阶段上下文**：
   - 获取所有阶段的聊天记录
   - 为其他阶段的消息添加阶段标识（如 `[职业规划] 消息内容`）
   - 合并到历史对话中（最多 20 条）

---

## 数据流

### 1. 返回按钮流程
```
用户点击返回按钮
  ↓
保存当前阶段的聊天记录
  ↓
显示阶段选择页面
  ↓
用户选择阶段
  ↓
保存当前阶段聊天记录
  ↓
切换到选中阶段
  ↓
加载该阶段的聊天记录
  ↓
显示该阶段的聊天界面
```

### 2. 发送消息流程
```
用户发送消息
  ↓
获取所有阶段的聊天记录
  ↓
合并为历史对话（添加阶段标识）
  ↓
调用 API（传递所有阶段上下文）
  ↓
收到 AI 回复
  ↓
保存当前阶段的聊天记录
```

### 3. 阶段切换流程
```
用户选择阶段
  ↓
保存当前阶段的聊天记录
  ↓
切换到新阶段
  ↓
加载新阶段的聊天记录
  ↓
更新 userStage 和 FSM
  ↓
显示新阶段的聊天界面
```

---

## 数据存储

### localStorage 键名

1. **`ajc_chatHistory`**：所有阶段的聊天记录
   ```json
   {
     "career_planning": [
       { "id": "...", "content": "...", "isUser": true, "timestamp": "..." }
     ],
     "project_review": [...],
     ...
   }
   ```

2. **`ajc_userStage`**：当前阶段
   ```json
   "career_planning"
   ```

3. **`ajc_whiteboardData`**：白板数据（用于判断阶段是否完成）

---

## UI/UX 特性

### 1. 阶段选择页面
- **已完成阶段**：
  - 绿色边框（`border-green-500`）
  - 绿色背景（`bg-green-50`）
  - 右上角绿色 ✓ 标记
  - 标签显示"已完成"

- **当前阶段**：
  - 蓝色边框（`border-blue-500`）
  - 蓝色背景（`bg-blue-50`）
  - 右上角蓝色 → 标记
  - 标签显示"当前阶段"

- **待开始阶段**：
  - 灰色边框（`border-gray-200`）
  - 白色背景（`bg-white`）
  - 标签显示"待开始"

### 2. 动画效果
- 使用 Framer Motion 实现卡片出现动画
- 延迟递增，营造流畅感

---

## 判断阶段完成的标准

### 基于白板数据
- `career_planning`：有 `intentRole` 或 `keySkills`
- `project_review`：有 `starProjects`
- `resume_optimization`：有 `resumeInsights`
- `application_strategy`：有 `targetCompanies`
- `interview`：有 `interviewReports`
- `salary_talk`：有 `salaryStrategy`
- `offer`：有 `offers`

### 基于聊天记录
- 如果某个阶段有聊天记录（`ajc_chatHistory[stage]` 存在且长度 > 0），则认为已完成

---

## API 上下文传递

### 历史对话格式
```typescript
[
  { role: "user", content: "[职业规划] 我想做前端开发" },
  { role: "assistant", content: "[职业规划] 好的，前端开发需要..." },
  { role: "user", content: "[项目梳理] 我做过一个电商项目" },
  { role: "assistant", content: "[项目梳理] 能详细说说吗？" },
  { role: "user", content: "这个项目用了 React" }, // 当前阶段，不加标识
  { role: "assistant", content: "React 是一个很好的选择" },
]
```

### 传递逻辑
1. 获取所有阶段的聊天记录
2. 为其他阶段的消息添加阶段标识（`[阶段名] 消息内容`）
3. 当前阶段的消息不加标识
4. 合并所有消息，最多保留 20 条（最近的）
5. 传递给 API 的 `history` 字段

---

## 测试验证

### 1. 测试阶段选择
```javascript
// 在浏览器控制台
// 查看聊天记录
const history = JSON.parse(localStorage.getItem("ajc_chatHistory"));
console.log("所有阶段聊天记录:", history);

// 查看当前阶段
console.log("当前阶段:", localStorage.getItem("ajc_userStage"));
```

### 2. 测试阶段切换
1. 在某个阶段发送几条消息
2. 点击返回按钮
3. 选择另一个阶段
4. 验证聊天记录是否正确切换

### 3. 测试上下文传递
1. 在多个阶段都有聊天记录
2. 切换到某个阶段发送消息
3. 查看网络请求，验证 `history` 字段是否包含所有阶段的记录

---

## 注意事项

1. **数据持久化**：
   - 聊天记录自动保存到 localStorage
   - 页面刷新后自动恢复

2. **阶段切换**：
   - 切换前自动保存当前阶段的聊天记录
   - 切换后自动加载新阶段的聊天记录

3. **上下文管理**：
   - 最多保留 20 条历史消息（避免 token 过多）
   - 其他阶段的消息添加阶段标识，便于 AI 理解

4. **完成判断**：
   - 基于白板数据和聊天记录双重判断
   - 如果白板数据或聊天记录任一存在，则认为已完成

5. **返回按钮**：
   - 始终显示（`canGoBack={true}`）
   - 点击后显示阶段选择页面，不再直接回退

---

## 文件清单

- ✅ `/components/StageSelector.tsx` - 阶段选择组件（新建）
- ✅ `/app/chat/page.tsx` - 主对话组件（已修改）

---

## 验证清单

- [x] 返回按钮显示阶段选择页面
- [x] 阶段选择页面显示所有阶段
- [x] 已完成阶段特殊标记
- [x] 当前阶段特殊标记
- [x] 点击阶段进入该阶段聊天
- [x] 聊天记录独立保存
- [x] 切换阶段时自动保存和加载
- [x] API 调用时传递所有阶段上下文
- [x] 页面刷新后恢复聊天记录

---

## 未来扩展

1. **阶段进度显示**：显示每个阶段的完成进度（0-100%）
2. **阶段锁定**：未完成前置阶段时，锁定后续阶段
3. **阶段总结**：为每个阶段生成总结报告
4. **导出功能**：导出所有阶段的聊天记录
5. **搜索功能**：在所有阶段的聊天记录中搜索关键词

