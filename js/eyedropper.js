/**
 * ============================================================
 * eyedropper.js —— 屏幕吸管模块
 * 优先使用浏览器原生 EyeDropper API（目前仅 Chromium 系浏览器
 * 支持）从屏幕任意位置取色；当浏览器不支持时自动降级，
 * 引导用户使用“图片取色”选项卡完成类似操作。
 * ============================================================
 */

import { featureSupport, showToast } from "./utils.js";

export class EyeDropperTool {
  /**
   * @param {Object} options
   * @param {Function} options.onPick 取色成功回调 (hex:string) => void
   * @param {Function} options.onUnsupported 不支持时的降级回调
   */
  constructor({ onPick, onUnsupported }) {
    this.onPick = onPick;
    this.onUnsupported = onUnsupported;
    this._active = false;
  }

  /** 当前浏览器是否原生支持 EyeDropper API */
  get isSupported() {
    return featureSupport.eyeDropper;
  }

  /**
   * 打开取色器。若浏览器不支持，会调用 onUnsupported 回调
   * 并给出友好提示，而不是抛出异常中断程序。
   */
  async open() {
    if (this._active) return; // 防止重复触发

    if (!this.isSupported) {
      showToast("当前浏览器不支持屏幕取色，已为你切换到图片取色");
      if (typeof this.onUnsupported === "function") {
        this.onUnsupported();
      }
      return;
    }

    try {
      this._active = true;
      // eslint-disable-next-line no-undef
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      if (result && result.sRGBHex && typeof this.onPick === "function") {
        this.onPick(result.sRGBHex);
      }
    } catch (error) {
      // 用户按下 Esc 取消取色时也会走到这里，属于正常操作，无需报错提示
      if (error && error.name !== "AbortError") {
        console.error("[ColorStudio Pro] 屏幕取色失败：", error);
        showToast("取色已取消");
      }
    } finally {
      this._active = false;
    }
  }
}
