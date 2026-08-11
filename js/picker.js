/**
 * ============================================================
 * picker.js —— 可视化选色器交互模块
 * 负责三块 Canvas 的绘制与交互：
 *   1. SV 二维选色区（Saturation × Value）
 *   2. Hue 竖向色相滑条
 *   3. Alpha 透明度滑条（棋盘底纹）
 * 统一使用 Pointer Events 实现鼠标 / 触摸 / 触控笔的一致支持，
 * 并对 devicePixelRatio 做适配以保证 Retina 屏幕下的清晰度。
 * ============================================================
 */

import { ColorMath } from "./color.js";
import { clamp, frameScheduler } from "./utils.js";

/**
 * 根据容器的 CSS 尺寸与设备像素比，配置 Canvas 的物理分辨率，
 * 并返回用于绘制的 2D 上下文（已按 dpr 缩放，后续绘制代码可
 * 直接使用 CSS 像素坐标系）。
 * @param {HTMLCanvasElement} canvas
 * @returns {{ctx: CanvasRenderingContext2D, cssWidth:number, cssHeight:number}}
 */
function setupRetinaCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth;
  const cssHeight = canvas.clientHeight || canvas.parentElement.clientHeight;

  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, cssWidth, cssHeight };
}

/**
 * ============================================================
 * SVPicker —— 二维饱和度 × 明度选色区
 * ============================================================
 */
export class SVPicker {
  /**
   * @param {Object} options
   * @param {HTMLCanvasElement} options.canvas
   * @param {HTMLElement} options.cursorEl 圆形指示器 DOM 元素
   * @param {HTMLElement} options.wrapperEl 外层容器（用于坐标计算 + 缩放）
   * @param {Function} options.onChange 回调 (s, v) => void，取值范围 0-100
   */
  constructor({ canvas, cursorEl, wrapperEl, onChange }) {
    this.canvas = canvas;
    this.cursorEl = cursorEl;
    this.wrapperEl = wrapperEl;
    this.onChange = onChange;

    this.hue = 0; // 当前色相，SV 区域的底色渐变依赖于它
    this.s = 100;
    this.v = 100;
    this.zoom = 1;

    this._dragging = false;

    this._bindEvents();
    // 首次挂载时，等待布局稳定后再绘制，避免尺寸为 0
    requestAnimationFrame(() => this.resize());
  }

  /** 设置缩放比例（picker-panel__zoom 按钮调用） */
  setZoom(zoom) {
    this.zoom = clamp(zoom, 0.5, 3);
    this.wrapperEl.style.transform = `scale(${this.zoom})`;
  }

  /** 响应容器尺寸变化，重新配置 Canvas 分辨率并重绘 */
  resize() {
    const { ctx, cssWidth, cssHeight } = setupRetinaCanvas(this.canvas);
    this.ctx = ctx;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.render();
    this._updateCursorPosition();
  }

  /**
   * 更新当前色相（由 Hue 滑条驱动），触发底色渐变重绘。
   * @param {number} hue 0-360
   */
  setHue(hue) {
    this.hue = hue;
    this.render();
  }

  /**
   * 以外部数据（例如手动输入 HEX 后换算得到的 HSV）同步选色点位置，
   * 不会触发 onChange，避免输入回环。
   */
  setValue(s, v) {
    this.s = clamp(s, 0, 100);
    this.v = clamp(v, 0, 100);
    this._updateCursorPosition();
  }

  /** 绘制 SV 渐变：横轴饱和度 0→100，纵轴明度 100→0 */
  render() {
    if (!this.ctx) return;
    frameScheduler.schedule("sv-render", () => {
      const { ctx, cssWidth, cssHeight } = this;

      // 第一层：纯色相的水平饱和度渐变（白 -> 纯色相）
      const saturationGradient = ctx.createLinearGradient(0, 0, cssWidth, 0);
      saturationGradient.addColorStop(0, "#ffffff");
      const pureHueRgb = ColorMath.hsvToRgb(this.hue, 100, 100);
      saturationGradient.addColorStop(
        1,
        `rgb(${pureHueRgb.r}, ${pureHueRgb.g}, ${pureHueRgb.b})`
      );
      ctx.fillStyle = saturationGradient;
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // 第二层：垂直明度渐变（透明 -> 黑），叠加在饱和度层之上
      const valueGradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
      valueGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      valueGradient.addColorStop(1, "rgba(0, 0, 0, 1)");
      ctx.fillStyle = valueGradient;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    });
  }

  /** 根据当前 s / v 计算并更新指示器圆点的位置 */
  _updateCursorPosition() {
    if (!this.cssWidth || !this.cssHeight) return;
    const x = (this.s / 100) * this.cssWidth;
    const y = (1 - this.v / 100) * this.cssHeight;
    this.cursorEl.style.left = `${x}px`;
    this.cursorEl.style.top = `${y}px`;
    // 根据背景明度动态调整指示器边框对比色，保证任何颜色下都清晰可见
    this.cursorEl.style.borderColor = this.v > 60 && this.s < 40 ? "#1c1e22" : "#ffffff";
  }

  /** 将指针事件坐标换算为 s / v 值并写回状态 */
  _handlePointer(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / this.zoom, 0, this.cssWidth);
    const y = clamp((clientY - rect.top) / this.zoom, 0, this.cssHeight);

    this.s = clamp((x / this.cssWidth) * 100, 0, 100);
    this.v = clamp(100 - (y / this.cssHeight) * 100, 0, 100);

    this._updateCursorPosition();
    if (typeof this.onChange === "function") {
      this.onChange(this.s, this.v);
    }
  }

  _bindEvents() {
    const onPointerDown = (event) => {
      this._dragging = true;
      this.canvas.setPointerCapture(event.pointerId);
      this._handlePointer(event.clientX, event.clientY);
    };
    const onPointerMove = (event) => {
      if (!this._dragging) return;
      this._handlePointer(event.clientX, event.clientY);
    };
    const onPointerUp = (event) => {
      this._dragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };

    this.canvas.addEventListener("pointerdown", onPointerDown);
    this.canvas.addEventListener("pointermove", onPointerMove);
    this.canvas.addEventListener("pointerup", onPointerUp);
    this.canvas.addEventListener("pointercancel", onPointerUp);

    window.addEventListener("resize", () => this.resize());
  }
}

/**
 * ============================================================
 * LinearSlider —— 通用竖向滑条基类
 * Hue 与 Alpha 滑条的绘制逻辑高度相似（都是竖向渐变条 + 拖拽指示器），
 * 因此抽象为共用基类，避免重复实现拖拽与坐标换算逻辑。
 * ============================================================
 */
class LinearSlider {
  constructor({ canvas, thumbEl, onChange, min = 0, max = 100 }) {
    this.canvas = canvas;
    this.thumbEl = thumbEl;
    this.onChange = onChange;
    this.min = min;
    this.max = max;
    this.value = min;
    this._dragging = false;

    this._bindEvents();
    requestAnimationFrame(() => this.resize());
  }

  resize() {
    const { ctx, cssWidth, cssHeight } = setupRetinaCanvas(this.canvas);
    this.ctx = ctx;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.render();
    this._updateThumbPosition();
  }

  /** 子类需覆写：绘制渐变背景 */
  render() {
    throw new Error("LinearSlider 子类必须实现 render()");
  }

  setValue(value) {
    this.value = clamp(value, this.min, this.max);
    this._updateThumbPosition();
  }

  _updateThumbPosition() {
    if (!this.cssHeight) return;
    const ratio = (this.value - this.min) / (this.max - this.min);
    const y = ratio * this.cssHeight;
    this.thumbEl.style.top = `${y}px`;
  }

  _handlePointer(clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const y = clamp(clientY - rect.top, 0, this.cssHeight);
    const ratio = y / this.cssHeight;
    this.value = this.min + ratio * (this.max - this.min);
    this._updateThumbPosition();
    if (typeof this.onChange === "function") {
      this.onChange(this.value);
    }
  }

  _bindEvents() {
    const onPointerDown = (event) => {
      this._dragging = true;
      this.canvas.setPointerCapture(event.pointerId);
      this._handlePointer(event.clientY);
    };
    const onPointerMove = (event) => {
      if (!this._dragging) return;
      this._handlePointer(event.clientY);
    };
    const onPointerUp = (event) => {
      this._dragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };

    this.canvas.addEventListener("pointerdown", onPointerDown);
    this.canvas.addEventListener("pointermove", onPointerMove);
    this.canvas.addEventListener("pointerup", onPointerUp);
    this.canvas.addEventListener("pointercancel", onPointerUp);

    window.addEventListener("resize", () => this.resize());
  }
}

/**
 * ============================================================
 * HueSlider —— 竖向色相滑条（0-360°，Canvas 绘制彩虹渐变）
 * ============================================================
 */
export class HueSlider extends LinearSlider {
  constructor(options) {
    super({ ...options, min: 0, max: 360 });
  }

  render() {
    if (!this.ctx) return;
    frameScheduler.schedule("hue-render", () => {
      const { ctx, cssWidth, cssHeight } = this;
      const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
      // 每 60° 添加一个色标，覆盖完整色相环
      const hueStops = [0, 60, 120, 180, 240, 300, 360];
      hueStops.forEach((hue) => {
        const rgb = ColorMath.hsvToRgb(hue, 100, 100);
        gradient.addColorStop(hue / 360, `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
      });
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    });
  }
}

/**
 * ============================================================
 * AlphaSlider —— 竖向透明度滑条（棋盘底纹 + 当前色半透明渐变）
 * ============================================================
 */
export class AlphaSlider extends LinearSlider {
  constructor(options) {
    super({ ...options, min: 0, max: 1 });
    this.baseColor = { r: 59, g: 130, b: 246 };
  }

  /**
   * 更新滑条所对应的基础颜色（不含透明度），
   * 每次主色变化时由 app.js 调用。
   */
  setBaseColor(r, g, b) {
    this.baseColor = { r, g, b };
    this.render();
  }

  /** 绘制棋盘格底纹，用于直观呈现透明度 */
  _drawCheckerboard(ctx, width, height) {
    const size = 8;
    for (let y = 0; y < height; y += size) {
      for (let x = 0; x < width; x += size) {
        const isEven = (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0;
        ctx.fillStyle = isEven ? "#3a3d43" : "#26282d";
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  render() {
    if (!this.ctx) return;
    frameScheduler.schedule("alpha-render", () => {
      const { ctx, cssWidth, cssHeight } = this;
      this._drawCheckerboard(ctx, cssWidth, cssHeight);

      const { r, g, b } = this.baseColor;
      const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    });
  }
}
