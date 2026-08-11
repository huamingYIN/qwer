/**
 * ============================================================
 * color.js —— 颜色算法核心模块
 * 独立实现全部颜色空间互转算法：
 *   HEX  <-> RGB
 *   RGB  <-> HSV(HSB)
 *   RGB  <-> HSL
 *   RGB  <-> CMYK
 *   RGB  <-> XYZ
 *   XYZ  <-> LAB
 * 不依赖任何第三方颜色库，全部为纯数学实现。
 *
 * 约定：
 *   RGB   分量范围 0-255
 *   HSV   H: 0-360, S/V: 0-100
 *   HSL   H: 0-360, S/L: 0-100
 *   CMYK  各分量 0-100
 *   LAB   L: 0-100, a/b: 约 -128 ~ 127
 *   XYZ   基于 CIE 1931，参考白点 D65，范围约 0-100
 *   Alpha 统一使用 0-1 的小数表示
 * ============================================================
 */

import { clamp, roundTo } from "./utils.js";

/** sRGB -> 线性 RGB 的 Gamma 校正阈值系数，供 XYZ 转换使用 */
const GAMMA_THRESHOLD = 0.04045;

/** CIE 1931 标准观察者 D65 参考白点（用于 LAB <-> XYZ 转换） */
const REFERENCE_WHITE = { X: 95.047, Y: 100.0, Z: 108.883 };

export class ColorMath {
  // ------------------------------------------------------------
  // HEX <-> RGB
  // ------------------------------------------------------------

  /**
   * 将 HEX 字符串解析为 { r, g, b, a }。
   * 支持 #RGB / #RGBA / #RRGGBB / #RRGGBBAA，大小写不敏感，
   * 允许省略前导 #。
   * @param {string} hex
   * @returns {{r:number,g:number,b:number,a:number}|null}
   */
  static hexToRgb(hex) {
    if (typeof hex !== "string") return null;
    let value = hex.trim().replace(/^#/, "");

    if (/^[0-9a-fA-F]{3}$/.test(value)) {
      // #RGB -> 每位复制一次变为 #RRGGBB
      value = value
        .split("")
        .map((ch) => ch + ch)
        .join("");
    } else if (/^[0-9a-fA-F]{4}$/.test(value)) {
      // #RGBA -> #RRGGBBAA
      value = value
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }

    if (/^[0-9a-fA-F]{6}$/.test(value)) {
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      return { r, g, b, a: 1 };
    }

    if (/^[0-9a-fA-F]{8}$/.test(value)) {
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      const a = parseInt(value.slice(6, 8), 16) / 255;
      return { r, g, b, a: roundTo(a, 3) };
    }

    return null;
  }

  /**
   * 将 RGB(A) 转为 HEX 字符串。
   * @param {number} r 0-255
   * @param {number} g 0-255
   * @param {number} b 0-255
   * @param {number} [a] 0-1，若小于 1 则输出 8 位含 Alpha 的 HEX
   * @returns {string}
   */
  static rgbToHex(r, g, b, a = 1) {
    const toHexPart = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
    let hex = `#${toHexPart(r)}${toHexPart(g)}${toHexPart(b)}`.toUpperCase();
    if (a < 1) {
      const alphaPart = clamp(Math.round(a * 255), 0, 255).toString(16).padStart(2, "0");
      hex += alphaPart.toUpperCase();
    }
    return hex;
  }

  // ------------------------------------------------------------
  // RGB <-> HSV (HSB)
  // ------------------------------------------------------------

  /**
   * RGB -> HSV。
   * @returns {{h:number,s:number,v:number}} h: 0-360, s/v: 0-100
   */
  static rgbToHsv(r, g, b) {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;

    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
      if (max === rNorm) {
        h = 60 * (((gNorm - bNorm) / delta) % 6);
      } else if (max === gNorm) {
        h = 60 * ((bNorm - rNorm) / delta + 2);
      } else {
        h = 60 * ((rNorm - gNorm) / delta + 4);
      }
    }
    if (h < 0) h += 360;

    const s = max === 0 ? 0 : delta / max;
    const v = max;

    return { h: roundTo(h, 1), s: roundTo(s * 100, 1), v: roundTo(v * 100, 1) };
  }

  /**
   * HSV -> RGB。
   * @param {number} h 0-360
   * @param {number} s 0-100
   * @param {number} v 0-100
   * @returns {{r:number,g:number,b:number}}
   */
  static hsvToRgb(h, s, v) {
    const hNorm = ((h % 360) + 360) % 360;
    const sNorm = clamp(s, 0, 100) / 100;
    const vNorm = clamp(v, 0, 100) / 100;

    const c = vNorm * sNorm;
    const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
    const m = vNorm - c;

    let rPrime = 0;
    let gPrime = 0;
    let bPrime = 0;

    if (hNorm < 60) {
      [rPrime, gPrime, bPrime] = [c, x, 0];
    } else if (hNorm < 120) {
      [rPrime, gPrime, bPrime] = [x, c, 0];
    } else if (hNorm < 180) {
      [rPrime, gPrime, bPrime] = [0, c, x];
    } else if (hNorm < 240) {
      [rPrime, gPrime, bPrime] = [0, x, c];
    } else if (hNorm < 300) {
      [rPrime, gPrime, bPrime] = [x, 0, c];
    } else {
      [rPrime, gPrime, bPrime] = [c, 0, x];
    }

    return {
      r: Math.round((rPrime + m) * 255),
      g: Math.round((gPrime + m) * 255),
      b: Math.round((bPrime + m) * 255),
    };
  }

  // ------------------------------------------------------------
  // RGB <-> HSL
  // ------------------------------------------------------------

  /**
   * RGB -> HSL。
   * @returns {{h:number,s:number,l:number}} h: 0-360, s/l: 0-100
   */
  static rgbToHsl(r, g, b) {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;

    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
      if (max === rNorm) {
        h = 60 * (((gNorm - bNorm) / delta) % 6);
      } else if (max === gNorm) {
        h = 60 * ((bNorm - rNorm) / delta + 2);
      } else {
        h = 60 * ((rNorm - gNorm) / delta + 4);
      }
    }
    if (h < 0) h += 360;

    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    return { h: roundTo(h, 1), s: roundTo(s * 100, 1), l: roundTo(l * 100, 1) };
  }

  /**
   * HSL -> RGB。
   * @param {number} h 0-360
   * @param {number} s 0-100
   * @param {number} l 0-100
   * @returns {{r:number,g:number,b:number}}
   */
  static hslToRgb(h, s, l) {
    const hNorm = ((h % 360) + 360) % 360;
    const sNorm = clamp(s, 0, 100) / 100;
    const lNorm = clamp(l, 0, 100) / 100;

    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
    const m = lNorm - c / 2;

    let rPrime = 0;
    let gPrime = 0;
    let bPrime = 0;

    if (hNorm < 60) {
      [rPrime, gPrime, bPrime] = [c, x, 0];
    } else if (hNorm < 120) {
      [rPrime, gPrime, bPrime] = [x, c, 0];
    } else if (hNorm < 180) {
      [rPrime, gPrime, bPrime] = [0, c, x];
    } else if (hNorm < 240) {
      [rPrime, gPrime, bPrime] = [0, x, c];
    } else if (hNorm < 300) {
      [rPrime, gPrime, bPrime] = [x, 0, c];
    } else {
      [rPrime, gPrime, bPrime] = [c, 0, x];
    }

    return {
      r: Math.round((rPrime + m) * 255),
      g: Math.round((gPrime + m) * 255),
      b: Math.round((bPrime + m) * 255),
    };
  }

  // ------------------------------------------------------------
  // RGB <-> CMYK
  // ------------------------------------------------------------

  /**
   * RGB -> CMYK（减色模型近似换算，用于屏幕预览，非印刷级 ICC 转换）。
   * @returns {{c:number,m:number,y:number,k:number}} 各分量 0-100
   */
  static rgbToCmyk(r, g, b) {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;

    const k = 1 - Math.max(rNorm, gNorm, bNorm);

    if (k === 1) {
      return { c: 0, m: 0, y: 0, k: 100 };
    }

    const c = (1 - rNorm - k) / (1 - k);
    const m = (1 - gNorm - k) / (1 - k);
    const y = (1 - bNorm - k) / (1 - k);

    return {
      c: roundTo(c * 100, 1),
      m: roundTo(m * 100, 1),
      y: roundTo(y * 100, 1),
      k: roundTo(k * 100, 1),
    };
  }

  /**
   * CMYK -> RGB。
   * @param {number} c 0-100
   * @param {number} m 0-100
   * @param {number} y 0-100
   * @param {number} k 0-100
   * @returns {{r:number,g:number,b:number}}
   */
  static cmykToRgb(c, m, y, k) {
    const cNorm = clamp(c, 0, 100) / 100;
    const mNorm = clamp(m, 0, 100) / 100;
    const yNorm = clamp(y, 0, 100) / 100;
    const kNorm = clamp(k, 0, 100) / 100;

    const r = 255 * (1 - cNorm) * (1 - kNorm);
    const g = 255 * (1 - mNorm) * (1 - kNorm);
    const b = 255 * (1 - yNorm) * (1 - kNorm);

    return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
  }

  // ------------------------------------------------------------
  // RGB <-> XYZ
  // ------------------------------------------------------------

  /**
   * sRGB 分量的 Gamma 校正（sRGB -> 线性 RGB）。
   * @param {number} channel 0-1 归一化后的分量
   */
  static _srgbToLinear(channel) {
    return channel <= GAMMA_THRESHOLD / 12.92
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }

  /**
   * 线性 RGB -> sRGB 的逆 Gamma 校正。
   * @param {number} channel 0-1 线性分量
   */
  static _linearToSrgb(channel) {
    return channel <= 0.0031308
      ? channel * 12.92
      : 1.055 * channel ** (1 / 2.4) - 0.055;
  }

  /**
   * RGB -> XYZ（CIE 1931，D65 参考白点，sRGB 工作空间）。
   * @returns {{x:number,y:number,z:number}} 各分量约 0-100
   */
  static rgbToXyz(r, g, b) {
    const rLin = ColorMath._srgbToLinear(r / 255);
    const gLin = ColorMath._srgbToLinear(g / 255);
    const bLin = ColorMath._srgbToLinear(b / 255);

    // sRGB -> XYZ 标准变换矩阵（D65）
    const x = rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375;
    const y = rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.072175;
    const z = rLin * 0.0193339 + gLin * 0.119192 + bLin * 0.9503041;

    return { x: roundTo(x * 100, 2), y: roundTo(y * 100, 2), z: roundTo(z * 100, 2) };
  }

  /**
   * XYZ -> RGB。
   * @param {number} x 0-100
   * @param {number} y 0-100
   * @param {number} z 0-100
   * @returns {{r:number,g:number,b:number}}
   */
  static xyzToRgb(x, y, z) {
    const xNorm = x / 100;
    const yNorm = y / 100;
    const zNorm = z / 100;

    // XYZ -> 线性 sRGB 标准逆变换矩阵（D65）
    const rLin = xNorm * 3.2404542 + yNorm * -1.5371385 + zNorm * -0.4985314;
    const gLin = xNorm * -0.969266 + yNorm * 1.8760108 + zNorm * 0.041556;
    const bLin = xNorm * 0.0556434 + yNorm * -0.2040259 + zNorm * 1.0572252;

    const r = ColorMath._linearToSrgb(rLin) * 255;
    const g = ColorMath._linearToSrgb(gLin) * 255;
    const b = ColorMath._linearToSrgb(bLin) * 255;

    return {
      r: Math.round(clamp(r, 0, 255)),
      g: Math.round(clamp(g, 0, 255)),
      b: Math.round(clamp(b, 0, 255)),
    };
  }

  // ------------------------------------------------------------
  // XYZ <-> LAB
  // ------------------------------------------------------------

  /** LAB 转换中使用的非线性映射函数 f(t) */
  static _labF(t) {
    const delta = 6 / 29;
    return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
  }

  /** LAB 转换中 f(t) 的逆函数 */
  static _labFInv(t) {
    const delta = 6 / 29;
    return t > delta ? t ** 3 : 3 * delta * delta * (t - 4 / 29);
  }

  /**
   * XYZ -> LAB（CIE L*a*b*，D65 参考白点）。
   * @returns {{l:number,a:number,b:number}}
   */
  static xyzToLab(x, y, z) {
    const fx = ColorMath._labF(x / REFERENCE_WHITE.X);
    const fy = ColorMath._labF(y / REFERENCE_WHITE.Y);
    const fz = ColorMath._labF(z / REFERENCE_WHITE.Z);

    const l = 116 * fy - 16;
    const a = 500 * (fx - fy);
    const b = 200 * (fy - fz);

    return { l: roundTo(l, 2), a: roundTo(a, 2), b: roundTo(b, 2) };
  }

  /**
   * LAB -> XYZ。
   * @param {number} l 0-100
   * @param {number} a 约 -128 ~ 127
   * @param {number} b 约 -128 ~ 127
   * @returns {{x:number,y:number,z:number}}
   */
  static labToXyz(l, a, b) {
    const fy = (l + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;

    const x = REFERENCE_WHITE.X * ColorMath._labFInv(fx);
    const y = REFERENCE_WHITE.Y * ColorMath._labFInv(fy);
    const z = REFERENCE_WHITE.Z * ColorMath._labFInv(fz);

    return { x: roundTo(x, 2), y: roundTo(y, 2), z: roundTo(z, 2) };
  }

  // ------------------------------------------------------------
  // RGB <-> LAB（组合 XYZ 中转，方便外部直接调用）
  // ------------------------------------------------------------

  static rgbToLab(r, g, b) {
    const xyz = ColorMath.rgbToXyz(r, g, b);
    return ColorMath.xyzToLab(xyz.x, xyz.y, xyz.z);
  }

  static labToRgb(l, a, b) {
    const xyz = ColorMath.labToXyz(l, a, b);
    return ColorMath.xyzToRgb(xyz.x, xyz.y, xyz.z);
  }

  // ------------------------------------------------------------
  // 相对亮度 / WCAG 对比度（供 export.js 与对比度检测面板使用）
  // ------------------------------------------------------------

  /**
   * 计算 sRGB 颜色的相对亮度（relative luminance），
   * 依据 WCAG 2.x 定义。
   * @returns {number} 0-1
   */
  static relativeLuminance(r, g, b) {
    const linearize = (channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const rLin = linearize(r);
    const gLin = linearize(g);
    const bLin = linearize(b);
    return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
  }

  /**
   * 计算两个颜色之间的 WCAG 对比度（1 ~ 21）。
   */
  static contrastRatio(rgbA, rgbB) {
    const lumA = ColorMath.relativeLuminance(rgbA.r, rgbA.g, rgbA.b);
    const lumB = ColorMath.relativeLuminance(rgbB.r, rgbB.g, rgbB.b);
    const lighter = Math.max(lumA, lumB);
    const darker = Math.min(lumA, lumB);
    return roundTo((lighter + 0.05) / (darker + 0.05), 2);
  }
}

/**
 * ColorState —— 颜色状态的统一封装。
 * 内部始终以 RGBA（0-255 / 0-1）作为唯一事实来源（Single Source of Truth），
 * 其它所有颜色空间的数值均通过 ColorMath 实时派生，
 * 从根本上避免多空间数据互相覆盖导致的精度漂移与不同步问题。
 */
export class ColorState {
  constructor(r = 59, g = 130, b = 246, a = 1) {
    this.r = clamp(Math.round(r), 0, 255);
    this.g = clamp(Math.round(g), 0, 255);
    this.b = clamp(Math.round(b), 0, 255);
    this.a = clamp(a, 0, 1);
  }

  clone() {
    return new ColorState(this.r, this.g, this.b, this.a);
  }

  /** 从 HEX 字符串创建颜色状态 */
  static fromHex(hex) {
    const parsed = ColorMath.hexToRgb(hex);
    if (!parsed) return null;
    return new ColorState(parsed.r, parsed.g, parsed.b, parsed.a);
  }

  static fromHsv(h, s, v, a = 1) {
    const rgb = ColorMath.hsvToRgb(h, s, v);
    return new ColorState(rgb.r, rgb.g, rgb.b, a);
  }

  static fromHsl(h, s, l, a = 1) {
    const rgb = ColorMath.hslToRgb(h, s, l);
    return new ColorState(rgb.r, rgb.g, rgb.b, a);
  }

  static fromCmyk(c, m, y, k, a = 1) {
    const rgb = ColorMath.cmykToRgb(c, m, y, k);
    return new ColorState(rgb.r, rgb.g, rgb.b, a);
  }

  static fromLab(l, aVal, bVal, alpha = 1) {
    const rgb = ColorMath.labToRgb(l, aVal, bVal);
    return new ColorState(rgb.r, rgb.g, rgb.b, alpha);
  }

  static fromXyz(x, y, z, a = 1) {
    const rgb = ColorMath.xyzToRgb(x, y, z);
    return new ColorState(rgb.r, rgb.g, rgb.b, a);
  }

  get hex() {
    return ColorMath.rgbToHex(this.r, this.g, this.b, 1);
  }

  get hexWithAlpha() {
    return ColorMath.rgbToHex(this.r, this.g, this.b, this.a);
  }

  get hsv() {
    return ColorMath.rgbToHsv(this.r, this.g, this.b);
  }

  get hsl() {
    return ColorMath.rgbToHsl(this.r, this.g, this.b);
  }

  get cmyk() {
    return ColorMath.rgbToCmyk(this.r, this.g, this.b);
  }

  get lab() {
    return ColorMath.rgbToLab(this.r, this.g, this.b);
  }

  get xyz() {
    return ColorMath.rgbToXyz(this.r, this.g, this.b);
  }

  /** CSS rgb() 字符串 */
  toRgbString() {
    return `rgb(${this.r}, ${this.g}, ${this.b})`;
  }

  /** CSS rgba() 字符串 */
  toRgbaString() {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${roundTo(this.a, 3)})`;
  }

  /** CSS hsl() 字符串 */
  toHslString() {
    const { h, s, l } = this.hsl;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  /** CSS hsla() 字符串 */
  toHslaString() {
    const { h, s, l } = this.hsl;
    return `hsla(${h}, ${s}%, ${l}%, ${roundTo(this.a, 3)})`;
  }
}
