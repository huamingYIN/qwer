/**
 * ============================================================
 * utils.js —— 通用工具函数模块
 * 提供防抖、节流、DOM 查询、剪贴板、文件下载等与颜色无关的
 * 基础能力，供其它模块复用，避免出现重复代码。
 * ============================================================
 */

/**
 * 防抖：在事件停止触发 wait 毫秒后才执行一次 fn。
 * 适用于：输入框数值同步、窗口 resize。
 * @param {Function} fn 目标函数
 * @param {number} wait 等待毫秒数
 * @returns {Function} 包装后的防抖函数
 */
export function debounce(fn, wait = 150) {
  let timerId = null;
  return function debounced(...args) {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, wait);
  };
}

/**
 * 节流：在 wait 毫秒时间窗口内最多执行一次 fn。
 * 适用于：鼠标拖动取色、滚动。内部使用 requestAnimationFrame
 * 进一步保证与浏览器渲染节奏对齐，减少无谓重绘。
 * @param {Function} fn 目标函数
 * @param {number} wait 最小时间间隔（毫秒）
 * @returns {Function} 包装后的节流函数
 */
export function throttle(fn, wait = 16) {
  let lastTime = 0;
  let rafId = null;
  return function throttled(...args) {
    const now = performance.now();
    const remaining = wait - (now - lastTime);
    if (remaining <= 0) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      lastTime = now;
      fn.apply(this, args);
    } else if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        lastTime = performance.now();
        rafId = null;
        fn.apply(this, args);
      });
    }
  };
}

/**
 * 使用 requestAnimationFrame 包装重复调用，返回一个可用于
 * cancelAnimationFrame 的句柄封装，用于 Canvas 高频重绘场景的
 * 统一调度，避免多个模块各自开启动画循环造成的性能浪费。
 */
export class FrameScheduler {
  constructor() {
    this._pending = new Map();
  }

  /**
   * 调度一个任务，同一个 key 在同一帧内只会执行最后一次调用。
   * @param {string} key 任务标识
   * @param {Function} task 要执行的任务
   */
  schedule(key, task) {
    if (this._pending.has(key)) {
      cancelAnimationFrame(this._pending.get(key));
    }
    const id = requestAnimationFrame(() => {
      this._pending.delete(key);
      task();
    });
    this._pending.set(key, id);
  }
}

/** 全局唯一的帧调度器实例，供各模块共享 */
export const frameScheduler = new FrameScheduler();

/**
 * 将数值限制在 [min, max] 区间内。
 */
export function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * 保留指定小数位数，并去除多余的尾随零。
 */
export function roundTo(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * 生成一个简单的唯一 ID（时间戳 + 随机串），
 * 用于历史记录 / 收藏色卡的 key，不依赖第三方库。
 */
export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * DOM 查询简写。
 */
export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

/**
 * 将文本写入系统剪贴板。优先使用 navigator.clipboard，
 * 在不支持或权限受限的环境中自动降级为
 * document.execCommand('copy') 方案。
 * @param {string} text 要复制的文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("Clipboard API 不可用，降级处理");
  } catch (error) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    } catch (fallbackError) {
      console.error("复制到剪贴板失败：", fallbackError);
      return false;
    }
  }
}

/**
 * 触发浏览器下载：将字符串或二进制内容保存为本地文件。
 * @param {string} filename 文件名
 * @param {string|Blob} content 文件内容
 * @param {string} mime MIME 类型
 */
export function downloadFile(filename, content, mime = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // 延迟释放 URL，确保下载已经开始
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 在容器内显示一个自动消失的 Toast 提示。
 * @param {string} message 提示文案
 */
export function showToast(message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  // 与 CSS 中 toastOut 动画的总时长保持一致后再移除节点
  setTimeout(() => {
    toast.remove();
  }, 2200);
}

/**
 * 检测当前设备是否支持触摸事件。
 */
export function isTouchDevice() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/**
 * 简单的浏览器特性检测集合，供 eyedropper.js 等模块使用。
 */
export const featureSupport = {
  get eyeDropper() {
    return typeof window.EyeDropper === "function";
  },
  get clipboard() {
    return Boolean(navigator.clipboard);
  },
};
