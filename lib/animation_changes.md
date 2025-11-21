# Framer Motion 动画改动说明

本文档说明为项目添加的 Framer Motion 动画改动，以及如何回退这些改动。

## 📦 依赖安装

首先需要安装 Framer Motion：

```bash
npm install framer-motion
# 或
yarn add framer-motion
# 或
pnpm add framer-motion
```

---

## 📝 改动点清单

### 1. `components/StageController.tsx`

**改动内容：**
- 添加 `framer-motion` 导入
- 为"返回上一步"按钮添加进入/退出动画（使用 `AnimatePresence`）
- 为阶段名称添加切换动画（淡入 + 向上滑动）

**动画效果：**
- 返回按钮：从左侧滑入（opacity + x 位移）
- 阶段名称：切换时淡入并向上滑动（opacity + y 位移）

**关键代码：**
```typescript
import { motion, AnimatePresence } from "framer-motion";

// 返回按钮动画
<AnimatePresence mode="wait">
  {canGoBack && (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      ...
    </motion.button>
  )}
</AnimatePresence>

// 阶段名称动画
<motion.span
  key={currentStage}
  initial={{ opacity: 0, y: -5 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: "easeOut" }}
>
  {currentStage}
</motion.span>
```

---

### 2. `components/StageTransitionModal.tsx`

**改动内容：**
- 添加 `framer-motion` 导入
- 使用 `AnimatePresence` 包裹整个模态
- 为背景遮罩添加淡入/淡出动画
- 为模态内容添加缩放 + 位移动画
- 为内部元素添加延迟动画（标题、文本、按钮）

**动画效果：**
- 背景遮罩：淡入/淡出（opacity）
- 模态内容：从中心缩放 + 向上位移（scale + y）
- 内部元素：依次淡入（stagger delay）

**关键代码：**
```typescript
import { motion, AnimatePresence } from "framer-motion";

<AnimatePresence>
  {isOpen && (
    <>
      {/* 背景遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      
      {/* 模态内容 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
      >
        ...
      </motion.div>
    </>
  )}
</AnimatePresence>
```

**注意：** 移除了 `if (!isOpen) return null;`，改用 `AnimatePresence` 控制显示/隐藏。

---

### 3. `components/DynamicBoard.tsx`

**改动内容：**
- 添加 `framer-motion` 导入
- 为容器添加 `stagger` 动画配置
- 为每个板块（intent, skills, projects, resumeSummary 等）添加进入动画
- 为列表项（简历优化项、面试准备项）添加独立动画

**动画效果：**
- 容器：使用 `staggerChildren` 实现子元素依次出现
- 板块：从左侧滑入 + 淡入（opacity + x + y）
- 列表项：缩放 + 淡入（scale + opacity），带延迟

**关键代码：**
```typescript
import { motion } from "framer-motion";

// 动画配置
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20, y: 10 },
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// 使用
<motion.div
  variants={containerVariants}
  initial="hidden"
  animate="visible"
>
  {parsedData.intent !== undefined && (
    <motion.div variants={itemVariants}>
      ...
    </motion.div>
  )}
</motion.div>
```

---

## 🔄 如何回退改动

### 方法 1：使用 Git 回退（推荐）

如果改动已提交到 Git：

```bash
# 查看改动
git diff components/StageController.tsx
git diff components/StageTransitionModal.tsx
git diff components/DynamicBoard.tsx

# 回退单个文件
git checkout HEAD -- components/StageController.tsx
git checkout HEAD -- components/StageTransitionModal.tsx
git checkout HEAD -- components/DynamicBoard.tsx

# 或回退所有改动
git checkout HEAD -- components/
```

### 方法 2：手动移除动画代码

#### 2.1 回退 `StageController.tsx`

**移除：**
```typescript
import { motion, AnimatePresence } from "framer-motion";
```

**替换：**
```typescript
// 移除 AnimatePresence 和 motion.button
{canGoBack && (
  <button
    onClick={onBack}
    className="..."
  >
    ...
  </button>
)}

// 移除 motion.span，使用普通 span
<span className="text-base font-semibold text-gray-900">
  {currentStage}
</span>
```

#### 2.2 回退 `StageTransitionModal.tsx`

**移除：**
```typescript
import { motion, AnimatePresence } from "framer-motion";
```

**替换：**
```typescript
// 恢复原来的结构
if (!isOpen) return null;

return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
      {/* 移除所有 motion.* 标签，使用普通 div/p */}
      ...
    </div>
  </div>
);
```

#### 2.3 回退 `DynamicBoard.tsx`

**移除：**
```typescript
import { motion } from "framer-motion";
```

**移除动画配置：**
```typescript
// 删除 containerVariants 和 itemVariants
```

**替换：**
```typescript
// 移除 motion.div，使用普通 div
<div className="h-full p-4 overflow-y-auto space-y-6">
  {parsedData.intent !== undefined && (
    <div className="p-4 bg-cyan-50 rounded-lg border border-cyan-200">
      ...
    </div>
  )}
  {/* 其他板块同样处理 */}
</div>

// 列表项也移除 motion.div
{parsedData.resumeOptimizations.map((item, index) => (
  <div
    key={index}
    className="..."
  >
    ...
  </div>
))}
```

### 方法 3：卸载依赖（可选）

如果完全不需要 Framer Motion：

```bash
npm uninstall framer-motion
# 或
yarn remove framer-motion
# 或
pnpm remove framer-motion
```

---

## ✅ 功能验证

添加动画后，确保以下功能正常：

1. **阶段切换：**
   - [ ] 阶段名称正确显示
   - [ ] 返回按钮正常显示/隐藏
   - [ ] 点击返回按钮能正常返回上一阶段

2. **模态：**
   - [ ] 模态能正常打开/关闭
   - [ ] 点击背景遮罩能关闭模态
   - [ ] 确认/取消按钮正常工作

3. **右侧板块：**
   - [ ] 板块能正常显示
   - [ ] 编辑功能正常
   - [ ] 点击导航按钮能正常跳转

---

## 🎨 动画参数说明

### 动画时长
- **快速动画：** 0.2s（按钮、遮罩）
- **标准动画：** 0.3s（阶段切换、板块出现）
- **延迟动画：** 0.1s - 0.25s（模态内部元素）

### 缓动函数
- **easeOut：** 用于进入动画，自然减速
- **默认：** 用于简单淡入

### 动画类型
- **淡入/淡出：** opacity 0 → 1
- **位移：** x, y 位移
- **缩放：** scale 0.9 → 1
- **组合：** 多种效果组合使用

---

## 📊 性能影响

- **包大小：** Framer Motion 约 50KB（gzipped）
- **运行时性能：** 动画使用 CSS transforms，性能良好
- **首屏加载：** 动画在组件挂载后执行，不影响首屏

---

## 🔧 故障排除

### 问题 1：动画不显示

**可能原因：**
- Framer Motion 未安装
- 导入路径错误

**解决方法：**
```bash
npm install framer-motion
# 检查导入语句
import { motion, AnimatePresence } from "framer-motion";
```

### 问题 2：动画卡顿

**可能原因：**
- 动画元素过多
- 设备性能较低

**解决方法：**
- 减少 `staggerChildren` 延迟
- 减少同时动画的元素数量
- 使用 `will-change` CSS 属性（Framer Motion 自动处理）

### 问题 3：模态无法关闭

**可能原因：**
- `AnimatePresence` 配置问题
- 事件处理冲突

**解决方法：**
- 检查 `onClick` 事件是否正确绑定
- 确保 `isOpen` 状态正确更新

---

## 📚 参考资源

- [Framer Motion 文档](https://www.framer.com/motion/)
- [AnimatePresence 文档](https://www.framer.com/motion/animate-presence/)
- [动画性能优化](https://www.framer.com/motion/performance/)

---

## 📝 改动总结

| 文件 | 改动类型 | 动画效果 | 影响范围 |
|------|---------|---------|---------|
| `StageController.tsx` | 添加动画 | 阶段切换、按钮显示 | 顶部导航栏 |
| `StageTransitionModal.tsx` | 添加动画 | 模态打开/关闭 | 阶段切换确认 |
| `DynamicBoard.tsx` | 添加动画 | 板块出现 | 右侧白板 |

**总改动：** 3 个文件，添加轻量动画，不影响现有功能。

