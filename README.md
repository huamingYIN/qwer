# ColorStudio Pro

一个纯原生 **HTML5 + CSS3 + JavaScript (ES6 Modules)** 实现的专业级网页颜色工具，界面设计参考 Photoshop、Figma、Adobe Color 与 VSCode 的深色工作台风格。全项目零第三方依赖、零构建工具，浏览器直接打开即可运行。

---

## 功能介绍

### 🎨 可视化选色器
- 大型 Saturation × Value 二维选色区（Canvas 绘制，非 `input[type=color]`）
- 竖向 Hue 色相滑条、Alpha 透明度滑条（棋盘底纹）
- 统一使用 Pointer Events 支持鼠标 / 触摸 / 触控笔拖动
- 自适应 `devicePixelRatio`，Retina 屏幕下依然清晰
- SV 选色区支持 50%~300% 缩放

### 🔢 全格式颜色数值
- HEX / RGB / RGBA / HSL / HSV(HSB) / CMYK / LAB / XYZ 全部可编辑
- 任意一个字段修改，其余全部实时双向同步
- 所有颜色转换算法均为自主实现，未使用任何第三方颜色库

### 📋 一键复制
支持复制为：HEX、RGB、RGBA、HSL、HSV、CMYK、LAB、XYZ、CSS、SCSS、LESS、Tailwind、Flutter (`Color(0x..)`)、SwiftUI (`Color(red:green:blue:opacity:)`)、Android XML。

### 🌈 配色方案生成
互补色、邻近色、三角色、四色、五角色、分裂互补、单色、渐变、Material 配色（10 级色阶），全部基于 HSV 色轮实时计算生成。

### 🕘 历史记录 & ⭐ 收藏颜色
- 最近使用颜色自动保存在 LocalStorage，浏览器关闭不丢失
- 收藏颜色支持新增、删除、原生拖拽排序（HTML5 Drag & Drop，无第三方库）

### 🖼️ 图片取色
上传本地图片后，点击图片任意位置即可取色，并实时同步到全部颜色字段。

### 💧 屏幕吸管
优先调用 Chrome/Edge 的原生 `EyeDropper` API；若浏览器不支持，自动降级引导用户使用“图片取色”选项卡。

### ♿ 对比度检测
基于 WCAG 2.x 相对亮度公式计算对比度，展示黑 / 白文字对比度、AA / AAA（正文与大字号）达标情况，并给出推荐文字颜色。

### 📤 导出
支持将当前配色方案导出为 CSS 变量、SCSS 变量、LESS 变量、JSON、Adobe Swatch Exchange（`.ase` 二进制，手工按规范构造字节流）、GIMP 调色板（`.gpl`）、纯文本（`.txt`）。

### 🌗 主题
支持浅色 / 深色 / 跟随系统三种模式，选择会持久化保存。

### 📱 响应式
针对手机、平板、桌面、4K 大屏均有独立断点适配；触摸设备下自动放大可拖拽命中区域。

### ⚡ 性能优化
- 所有 Canvas 重绘通过统一的 `FrameScheduler`（基于 `requestAnimationFrame`）调度，避免同一帧内重复绘制
- 数值输入框变更使用防抖（debounce），拖拽类交互使用节流（throttle）
- Canvas 绘制仅在尺寸变化 / 数值变化时触发，不做无意义的持续重绘

---

## 目录结构

```
ColorStudio-Pro/
├── index.html          # 页面结构与所有可交互控件
├── style.css            # 全局样式（含深色/浅色主题、响应式、动画）
├── app.js               # 应用主入口，整合全部模块并完成事件绑定
├── js/
│   ├── color.js          # 颜色算法核心：HEX/RGB/HSV/HSL/CMYK/LAB/XYZ 互转
│   ├── picker.js         # SV 选色区 / Hue 滑条 / Alpha 滑条的 Canvas 绘制与交互
│   ├── palette.js        # 9 种配色方案生成算法
│   ├── history.js        # 历史记录 + 收藏颜色管理（含 LocalStorage 持久化）
│   ├── storage.js        # LocalStorage 读写的统一封装
│   ├── export.js         # 单色格式化 + 调色板文件导出（含手工构造的 ASE 二进制）
│   ├── eyedropper.js     # EyeDropper API 封装与降级处理
│   └── utils.js          # 防抖/节流/剪贴板/下载/DOM 等通用工具
├── assets/
│   └── icons/            # 预留图标目录（当前使用内联 SVG，无需额外资源）
└── README.md
```

---

## 运行方法

本项目不依赖任何构建工具，有两种运行方式：

**方式一：直接打开**
双击 `index.html` 在浏览器中打开即可（部分浏览器的模块加载在 `file://` 协议下可能受限，推荐方式二）。

**方式二：本地静态服务器（推荐）**
在项目根目录下执行任意一种：

```bash
# 使用 Python 3
python3 -m http.server 8080

# 或使用 Node.js 自带的 npx（仅用于启动静态服务器，非项目依赖）
npx serve .
```

然后访问 `http://localhost:8080` 即可。

---

## 浏览器兼容

| 功能 | Chrome / Edge | Firefox | Safari |
| --- | --- | --- | --- |
| 基础选色 / 数值同步 | ✅ | ✅ | ✅ |
| ES6 Modules | ✅ | ✅ | ✅ |
| Canvas 2D | ✅ | ✅ | ✅ |
| Pointer Events（鼠标+触摸） | ✅ | ✅ | ✅ |
| 原生 EyeDropper API | ✅ | ❌（自动降级为图片取色） | ❌（自动降级为图片取色） |
| navigator.clipboard | ✅ | ✅ | ✅（需 HTTPS 或 localhost） |
| LocalStorage | ✅ | ✅ | ✅ |

---

## 算法介绍

### RGB ↔ HSV / HSL
采用标准的 CIE 色轮几何推导公式，通过最大值、最小值与色相扇区判断实现，详见 `color.js` 中 `rgbToHsv` / `hsvToRgb` / `rgbToHsl` / `hslToRgb`。

### RGB ↔ CMYK
使用经典的减色模型近似换算：先求黑版 `K = 1 - max(R,G,B)`，再反推 C/M/Y，适用于屏幕预览场景（非印刷级 ICC Profile 转换）。

### RGB ↔ XYZ ↔ LAB
- RGB → XYZ：先做 sRGB 的 Gamma 校正得到线性 RGB，再乘以 D65 参考白点下的标准 3×3 变换矩阵
- XYZ → LAB：使用 CIE 定义的分段非线性函数 `f(t)`，以 D65 参考白点（X=95.047, Y=100, Z=108.883）归一化后计算 L\*a\*b\*
- 反向转换（LAB → XYZ → RGB）同样严格按照上述公式的逆运算实现

### WCAG 对比度
依据 WCAG 2.x 标准，先计算两个颜色的相对亮度（Relative Luminance），再用 `(L1 + 0.05) / (L2 + 0.05)` 公式得到 1:1 ~ 21:1 的对比度数值，据此判断 AA / AAA 等级是否达标。

### Adobe Swatch Exchange（.ase）
未借助任何第三方库，严格按照 ASE 二进制规范手工构造字节流：文件签名 `ASEF` → 版本号 → 数据块数量 → 每个颜色块（类型标识 + 数据长度 + UTF-16BE 编码的名称 + `RGB ` 颜色模型标识 + 三个 32 位浮点分量 + 颜色类型），全部使用 `ArrayBuffer` / `DataView` 精确控制字节序（大端序）。

---

## 许可

本项目为演示性质的工业级前端实现，可自由用于学习与二次开发。
