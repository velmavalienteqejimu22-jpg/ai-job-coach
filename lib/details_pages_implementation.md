# 详情页功能实现说明

## 概述

实现了白板卡片到详情页的跳转功能，用户可以从白板点击卡片进入详情页，查看完整信息，并可以返回主对话页面。

---

## 文件结构

### 1. 统一布局
- `/app/details/layout.tsx` - 所有详情页的共有布局，包含顶部返回按钮

### 2. 详情页路由
- `/app/details/project/[id]/page.tsx` - 项目 STAR 详情页
- `/app/details/resume/[id]/page.tsx` - 简历优化详情页
- `/app/details/interview/[id]/page.tsx` - 面试详情页

### 3. 组件
- `/components/detail-nav.tsx` - 返回按钮组件（备用）
- `/components/ResumeDiff.tsx` - 简历对比组件，高亮差异

### 4. 更新的文件
- `/components/Whiteboard.tsx` - 添加了卡片点击跳转功能

---

## 功能特性

### 1. 白板卡片可点击

#### 项目卡片
- 点击项目卡片 → 跳转到 `/details/project/[id]`
- 显示完整的 STAR 结构（Situation, Task, Action, Result）

#### 简历优化卡片
- 点击简历优化卡片 → 跳转到 `/details/resume/[id]`
- 显示原句 vs 优化句对比
- 支持下载优化后的简历
- 支持删除优化建议

#### 面试报告卡片
- 点击面试报告卡片 → 跳转到 `/details/interview/[id]`
- 显示所有问题、回答、AI 反馈
- 显示优点和改进建议

---

### 2. 详情页功能

#### 项目详情页 (`/details/project/[id]`)
- **显示内容**：
  - 项目标题
  - STAR 四要素（带图标和颜色区分）
    - S: Situation（背景）- 蓝色
    - T: Task（任务）- 绿色
    - A: Action（行动）- 紫色
    - R: Result（结果）- 橙色
- **功能**：
  - 从 localStorage 读取项目数据
  - 返回按钮回到主对话页面

#### 简历优化详情页 (`/details/resume/[id]`)
- **显示内容**：
  - 多个句子堆叠展示
  - 原始句子（灰底，删除线）
  - 优化后句子（高亮差异部分）
  - 优化原因和建议（悬浮显示）
- **功能**：
  - 高亮变化部分（使用 `<mark>` 标签）
  - 下载优化简历（生成文本文件）
  - 删除优化建议
  - 返回按钮

#### 面试详情页 (`/details/interview/[id]`)
- **显示内容**：
  - 轮次信息（面试类型：技术面/业务面/HR面）
  - 总分
  - 问题列表（可折叠展开）
    - 问题内容
    - 用户回答
    - AI 反馈
    - 评分
    - AI Tips 框（考察点、回答结构、行业知识、避坑）
  - 优点和改进建议
- **功能**：
  - 问题可折叠/展开
  - 返回按钮

---

### 3. 数据获取

所有详情页都从 `localStorage` 的 `ajc_whiteboardData` 中读取数据：

```typescript
const whiteboardDataStr = localStorage.getItem("ajc_whiteboardData");
const whiteboardData: WhiteboardData = JSON.parse(whiteboardDataStr);
```

通过 `id` 参数查找对应的数据项。

---

### 4. 统一布局

`/app/details/layout.tsx` 提供：
- 顶部导航栏（固定定位）
- 返回按钮（返回 `/chat`）
- 统一的背景色和容器样式

---

## 组件说明

### ResumeDiff 组件

**功能**：显示简历原句和优化句的对比

**特性**：
- 原始句子：灰底，删除线
- 优化后句子：高亮差异部分（黄色背景，粗体）
- 改进点标签
- 悬浮显示优化原因

**高亮算法**：
- 简单的单词级别对比
- 新增或修改的词汇使用 `<mark>` 标签高亮

---

## 跳转逻辑

### Whiteboard 组件中的跳转

```typescript
// 项目卡片
handleProjectClick(projectId) → router.push(`/details/project/${projectId}`)

// 简历优化卡片
handleResumeClick(insightId) → router.push(`/details/resume/${insightId}`)

// 面试报告卡片
handleInterviewClick(reportId) → router.push(`/details/interview/${reportId}`)
```

---

## UI/UX 特性

### 1. 卡片交互
- 鼠标悬停时边框颜色变化
- 显示箭头图标（→）提示可点击
- 点击区域覆盖整个卡片

### 2. 详情页设计
- 统一的白色卡片背景
- 清晰的标题和分段
- 响应式布局（最大宽度 4xl）
- 统一的按钮样式

### 3. 返回功能
- 顶部导航栏固定，始终可见
- 返回按钮在多个位置（顶部导航 + 底部按钮）
- 返回后保持原有白板内容和聊天记录

---

## 数据流

```
用户点击白板卡片
  ↓
router.push('/details/[type]/[id]')
  ↓
详情页组件加载
  ↓
从 localStorage 读取 ajc_whiteboardData
  ↓
根据 id 查找对应数据项
  ↓
渲染详情内容
  ↓
用户点击返回
  ↓
router.push('/chat')
  ↓
回到主对话页面（白板数据保留）
```

---

## 测试验证

### 1. 测试跳转
```javascript
// 在浏览器控制台
// 检查白板数据
const data = JSON.parse(localStorage.getItem("ajc_whiteboardData"));
console.log("项目:", data.starProjects);
console.log("简历优化:", data.resumeInsights);
console.log("面试报告:", data.interviewReports);

// 手动跳转测试
window.location.href = "/details/project/[某个id]";
```

### 2. 测试数据读取
- 确保 localStorage 中有 `ajc_whiteboardData`
- 确保数据项有 `id` 字段
- 测试不存在的 id 时的降级处理

### 3. 测试返回功能
- 从详情页点击返回
- 验证回到 `/chat` 页面
- 验证白板数据仍然存在

---

## 注意事项

1. **数据持久化**：
   - 详情页从 localStorage 读取数据
   - 确保白板数据已保存到 localStorage

2. **ID 唯一性**：
   - 每个数据项必须有唯一的 `id`
   - API 自动生成 ID（格式：`type_timestamp_index`）

3. **降级处理**：
   - 如果找不到数据，使用模拟数据
   - 显示友好的加载状态

4. **路由一致性**：
   - 所有详情页使用 `/details/[type]/[id]` 格式
   - 返回路径统一为 `/chat`

5. **布局继承**：
   - 详情页自动使用 `layout.tsx` 的布局
   - 不需要在每个页面重复导航栏代码

---

## 文件清单

- ✅ `/app/details/layout.tsx` - 统一布局
- ✅ `/app/details/project/[id]/page.tsx` - 项目详情页
- ✅ `/app/details/resume/[id]/page.tsx` - 简历优化详情页
- ✅ `/app/details/interview/[id]/page.tsx` - 面试详情页
- ✅ `/components/detail-nav.tsx` - 返回按钮组件（备用）
- ✅ `/components/ResumeDiff.tsx` - 简历对比组件
- ✅ `/components/Whiteboard.tsx` - 白板组件（已更新）

---

## 验证清单

- [x] 白板卡片可点击
- [x] 项目卡片跳转到详情页
- [x] 简历优化卡片跳转到详情页
- [x] 面试报告卡片跳转到详情页
- [x] 详情页从 localStorage 读取数据
- [x] 详情页显示完整内容
- [x] 返回按钮功能正常
- [x] 返回后白板数据保留
- [x] 统一布局正常工作
- [x] 简历对比高亮正常
- [x] 面试问题可折叠展开
- [x] 下载功能正常

---

## 未来扩展

1. **编辑功能**：允许在详情页直接编辑内容
2. **分享功能**：分享详情页链接
3. **导出功能**：导出详情为 PDF/Word
4. **历史版本**：查看内容的修改历史
5. **评论功能**：在详情页添加评论和笔记

