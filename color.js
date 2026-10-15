/* ============================================================
 * ColorStudio Pro - color.js
 * 颜色科学计算模块（纯函数，无 DOM 依赖）
 * 覆盖：HEX / RGB / RGBA / HSL / HSV(HSB) / CMYK / XYZ / LAB / LCH
 * 色彩空间：sRGB，白点 D65
 * ============================================================ */
(function (global) {
  'use strict';

  const ColorMath = {};

  /* ---------- 基础工具 ---------- */
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function mod(n, m) { return ((n % m) + m) % m; }
  function round(v, d) { const p = Math.pow(10, d || 0); return Math.round(v * p) / p; }
  function toHex2(v) { return clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'); }

  ColorMath.clamp = clamp;
  ColorMath.mod = mod;
  ColorMath.round = round;

  /* ============================================================
   * HEX <-> RGB
   * ============================================================ */
  ColorMath.rgbToHex = function (r, g, b, a) {
    let hex = '#' + toHex2(r) + toHex2(g) + toHex2(b);
    if (a !== undefined && a < 1) hex += toHex2(a * 255);
    return hex.toUpperCase();
  };

  // 返回 {r,g,b,a} 或 null
  ColorMath.parseHex = function (input) {
    if (typeof input !== 'string') return null;
    let s = input.trim();
    if (s[0] !== '#') s = '#' + s;
    if (!/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return null;
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      h = h.split('').map(c => c + c).join('');
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    let a = 1;
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
    return { r: r, g: g, b: b, a: a };
  };

  /* ============================================================
   * RGB <-> HSL   (h:0-360, s/l:0-1)
   * ============================================================ */
  ColorMath.rgbToHsl = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h: h, s: s, l: l };
  };

  ColorMath.hslToRgb = function (h, s, l) {
    h = mod(h, 360) / 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = function (p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: r * 255, g: g * 255, b: b * 255 };
  };

  /* ============================================================
   * RGB <-> HSV / HSB   (h:0-360, s/v:0-1)
   * ============================================================ */
  ColorMath.rgbToHsv = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (d !== 0) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h: h, s: s, v: v };
  };

  ColorMath.hsvToRgb = function (h, s, v) {
    h = mod(h, 360);
    s = clamp(s, 0, 1);
    v = clamp(v, 0, 1);
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  };

  /* ============================================================
   * RGB <-> CMYK   (c/m/y/k:0-1)
   * 注意：CMYK 转换受 ICC Profile / 纸张 / 设备影响，
   * 此处为通用数学转换，结果仅供印刷参考。
   * ============================================================ */
  ColorMath.rgbToCmyk = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    let c = 0, m = 0, y = 0;
    if (k < 1) {
      c = (1 - r - k) / (1 - k);
      m = (1 - g - k) / (1 - k);
      y = (1 - b - k) / (1 - k);
    }
    return { c: c, m: m, y: y, k: k };
  };

  ColorMath.cmykToRgb = function (c, m, y, k) {
    c = clamp(c, 0, 1); m = clamp(m, 0, 1); y = clamp(y, 0, 1); k = clamp(k, 0, 1);
    const r = 255 * (1 - c) * (1 - k);
    const g = 255 * (1 - m) * (1 - k);
    const b = 255 * (1 - y) * (1 - k);
    return { r: r, g: g, b: b };
  };

  /* ============================================================
   * RGB <-> XYZ  (sRGB D65)
   * ============================================================ */
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(c) {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return clamp(v * 255, 0, 255);
  }

  ColorMath.rgbToXyz = function (r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    return {
      x: (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100,
      y: (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) * 100,
      z: (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) * 100
    };
  };

  ColorMath.xyzToRgb = function (x, y, z) {
    x /= 100; y /= 100; z /= 100;
    const R = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
    const G = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
    const B = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
    return { r: linearToSrgb(R), g: linearToSrgb(G), b: linearToSrgb(B) };
  };

  /* ============================================================
   * XYZ <-> LAB  (D65)
   * ============================================================ */
  const REF_X = 95.047, REF_Y = 100.0, REF_Z = 108.883;

  function labF(t) {
    const d = 6 / 29;
    return t > Math.pow(d, 3) ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
  }
  function labFInv(t) {
    const d = 6 / 29;
    return t > d ? t * t * t : 3 * d * d * (t - 4 / 29);
  }

  ColorMath.xyzToLab = function (x, y, z) {
    const fx = labF(x / REF_X);
    const fy = labF(y / REF_Y);
    const fz = labF(z / REF_Z);
    return {
      l: 116 * fy - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz)
    };
  };

  ColorMath.labToXyz = function (l, a, b) {
    const fy = (l + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;
    return {
      x: labFInv(fx) * REF_X,
      y: labFInv(fy) * REF_Y,
      z: labFInv(fz) * REF_Z
    };
  };

  ColorMath.rgbToLab = function (r, g, b) {
    const xyz = ColorMath.rgbToXyz(r, g, b);
    return ColorMath.xyzToLab(xyz.x, xyz.y, xyz.z);
  };

  ColorMath.labToRgb = function (l, a, b) {
    const xyz = ColorMath.labToXyz(l, a, b);
    return ColorMath.xyzToRgb(xyz.x, xyz.y, xyz.z);
  };

  /* ============================================================
   * LAB <-> LCH
   * ============================================================ */
  ColorMath.labToLch = function (l, a, b) {
    const c = Math.sqrt(a * a + b * b);
    let h = Math.atan2(b, a) * 180 / Math.PI;
    if (h < 0) h += 360;
    return { l: l, c: c, h: h };
  };

  ColorMath.lchToLab = function (l, c, h) {
    const hr = h * Math.PI / 180;
    return { l: l, a: Math.cos(hr) * c, b: Math.sin(hr) * c };
  };

  ColorMath.rgbToLch = function (r, g, b) {
    const lab = ColorMath.rgbToLab(r, g, b);
    return ColorMath.labToLch(lab.l, lab.a, lab.b);
  };

  /* ============================================================
   * 颜色解析：自动识别 HEX / RGB / RGBA / HSL / HSV(HSB) / CMYK
   * 返回 {r,g,b,a}（0-255，a:0-1）或 null
   * ============================================================ */

  // 角度：支持 180 / 180deg / 0.5turn / 3.14rad
  function parseAngle(str) {
    str = str.trim().toLowerCase();
    const m = str.match(/^(-?[\d.]+)(deg|turn|rad|grad)?$/);
    if (!m) return null;
    let v = parseFloat(m[1]);
    const unit = m[2] || 'deg';
    if (unit === 'turn') v *= 360;
    else if (unit === 'rad') v = v * 180 / Math.PI;
    else if (unit === 'grad') v *= 0.9;
    return v;
  }

  // 百分比/小数："50%" -> 0.5 ; "0.5" -> 0.5（按比例模式）
  function parseRatio(str) {
    str = str.trim();
    const m = str.match(/^([\d.]+)%$/);
    if (m) return clamp(parseFloat(m[1]) / 100, 0, 1);
    if (/^[\d.]+$/.test(str)) return clamp(parseFloat(str), 0, 1);
    return null;
  }

  // RGB 通道：255 制或百分比
  function parseChannel(str) {
    str = str.trim();
    const m = str.match(/^([\d.]+)%$/);
    if (m) return clamp(parseFloat(m[1]) * 2.55, 0, 255);
    if (/^[\d.]+$/.test(str)) return clamp(parseFloat(str), 0, 255);
    return null;
  }

  // Alpha：0-1 或百分比
  function parseAlpha(str) {
    str = str.trim();
    const m = str.match(/^([\d.]+)%$/);
    if (m) return clamp(parseFloat(m[1]) / 100, 0, 1);
    if (/^[\d.]+$/.test(str)) return clamp(parseFloat(str), 0, 1);
    return null;
  }

  // 拆分函数参数：兼容逗号、空白、斜杠 alpha
  function splitArgs(inner) {
    inner = inner.trim().replace(/\s*\/\s*/, ' / ');
    let parts;
    if (inner.indexOf(',') !== -1) {
      parts = inner.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      parts = inner.split(/\s+/).filter(Boolean);
    }
    // 合并 " / " alpha
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '/') { continue; }
      if (i > 0 && parts[i - 1] === '/') { out[out.length - 1] = out[out.length - 1] + ' / ' + parts[i]; }
      else out.push(parts[i]);
    }
    return out;
  }

  ColorMath.parse = function (input) {
    if (input === null || input === undefined) return null;
    if (typeof input === 'object') {
      if (typeof input.r === 'number' && typeof input.g === 'number' && typeof input.b === 'number') {
        return {
          r: clamp(input.r, 0, 255),
          g: clamp(input.g, 0, 255),
          b: clamp(input.b, 0, 255),
          a: input.a === undefined ? 1 : clamp(input.a, 0, 1)
        };
      }
      return null;
    }
    let s = String(input).trim();
    if (!s) return null;

    // HEX
    if (s[0] === '#' || /^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{3}$/.test(s)) {
      const hex = ColorMath.parseHex(s);
      if (hex) return hex;
    }

    // 函数式
    const fn = s.match(/^([a-zA-Z]+)\s*\(([^)]*)\)$/);
    if (!fn) return null;
    const name = fn[1].toLowerCase();
    const args = splitArgs(fn[2]);
    let alphaFromSlash = null;
    if (args.length && args[0].indexOf(' / ') !== -1) {
      const sp = args[0].split(' / ');
      args[0] = sp[0];
      alphaFromSlash = sp[1];
    }

    try {
      if (name === 'rgb' || name === 'rgba') {
        if (args.length < 3) return null;
        const r = parseChannel(args[0]), g = parseChannel(args[1]), b = parseChannel(args[2]);
        if (r === null || g === null || b === null) return null;
        let a = 1;
        const aStr = alphaFromSlash || args[3];
        if (aStr) a = parseAlpha(aStr);
        return { r: r, g: g, b: b, a: a };
      }

      if (name === 'hsl' || name === 'hsla') {
        if (args.length < 3) return null;
        const h = parseAngle(args[0]);
        const sat = parseRatio(args[1]);
        const lig = parseRatio(args[2]);
        if (h === null || sat === null || lig === null) return null;
        const rgb = ColorMath.hslToRgb(h, sat, lig);
        let a = 1;
        const aStr = alphaFromSlash || args[3];
        if (aStr) a = parseAlpha(aStr);
        return { r: rgb.r, g: rgb.g, b: rgb.b, a: a };
      }

      if (name === 'hsv' || name === 'hsb') {
        if (args.length < 3) return null;
        const h = parseAngle(args[0]);
        const sat = parseRatio(args[1]);
        const val = parseRatio(args[2]);
        if (h === null || sat === null || val === null) return null;
        const rgb = ColorMath.hsvToRgb(h, sat, val);
        let a = 1;
        if (args[3]) a = parseAlpha(args[3]);
        return { r: rgb.r, g: rgb.g, b: rgb.b, a: a };
      }

      if (name === 'cmyk') {
        if (args.length < 4) return null;
        const c = parseRatio(args[0]);
        const m = parseRatio(args[1]);
        const y = parseRatio(args[2]);
        const k = parseRatio(args[3]);
        if (c === null || m === null || y === null || k === null) return null;
        const rgb = ColorMath.cmykToRgb(c, m, y, k);
        return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  /* ============================================================
   * 专业格式输出
   * ============================================================ */
  ColorMath.format = {
    hex: function (c) { return ColorMath.rgbToHex(c.r, c.g, c.b, c.a); },
    rgb: function (c) {
      return 'rgb(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ')';
    },
    rgba: function (c) {
      return 'rgba(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ', ' + round(c.a, 2) + ')';
    },
    hsl: function (c) {
      const h = ColorMath.rgbToHsl(c.r, c.g, c.b);
      return 'hsl(' + round(h.h) + ', ' + round(h.s * 100) + '%, ' + round(h.l * 100) + '%)';
    },
    hsv: function (c) {
      const h = ColorMath.rgbToHsv(c.r, c.g, c.b);
      return 'hsv(' + round(h.h) + ', ' + round(h.s * 100) + '%, ' + round(h.v * 100) + '%)';
    },
    cmyk: function (c) {
      const k = ColorMath.rgbToCmyk(c.r, c.g, c.b);
      return 'cmyk(' + round(k.c * 100) + '%, ' + round(k.m * 100) + '%, ' +
        round(k.y * 100) + '%, ' + round(k.k * 100) + '%)';
    },
    lab: function (c) {
      const l = ColorMath.rgbToLab(c.r, c.g, c.b);
      return 'lab(' + round(l.l, 1) + ', ' + round(l.a, 1) + ', ' + round(l.b, 1) + ')';
    },
    lch: function (c) {
      const l = ColorMath.rgbToLch(c.r, c.g, c.b);
      return 'lch(' + round(l.l, 1) + ', ' + round(l.c, 1) + ', ' + round(l.h, 1) + ')';
    },
    xyz: function (c) {
      const x = ColorMath.rgbToXyz(c.r, c.g, c.b);
      return 'xyz(' + round(x.x, 2) + ', ' + round(x.y, 2) + ', ' + round(x.z, 2) + ')';
    }
  };

  /* ============================================================
   * 中文颜色命名
   * ============================================================ */

  // 常见命名色（RGB 距离 < 阈值 时命中）
  const NAMED_COLORS = [
    [255, 255, 255, '白色'], [0, 0, 0, '黑色'], [255, 0, 0, '红色'],
    [0, 255, 0, '绿色'], [0, 0, 255, '蓝色'], [255, 255, 0, '黄色'],
    [0, 255, 255, '青色'], [255, 0, 255, '品红色'], [128, 0, 0, '深红色'],
    [220, 20, 60, '绯红'], [255, 99, 71, '番茄红'], [255, 127, 80, '珊瑚橙'],
    [255, 165, 0, '橙色'], [255, 140, 0, '深橙色'], [255, 215, 0, '金黄色'],
    [245, 222, 179, '小麦色'], [245, 245, 220, '米白色'], [255, 248, 220, '象牙色'],
    [240, 230, 140, '卡其色'], [128, 128, 0, '橄榄色'], [154, 205, 50, '黄绿色'],
    [50, 205, 50, '酸橙绿'], [0, 128, 0, '深绿色'], [34, 139, 34, '森林绿'],
    [62, 180, 137, '薄荷绿'], [0, 128, 128, '青绿色'], [0, 139, 139, '深青色'],
    [135, 206, 235, '天空蓝'], [30, 144, 255, '道奇蓝'], [65, 105, 225, '皇家蓝'],
    [0, 0, 139, '深蓝色'], [0, 0, 128, '藏青色'], [0, 51, 102, '深海蓝'],
    [106, 90, 205, '石板蓝'], [138, 43, 226, '蓝紫色'], [128, 0, 128, '紫色'],
    [75, 0, 130, '深紫色'], [255, 0, 128, '玫红色'], [255, 105, 180, '热粉色'],
    [255, 192, 203, '粉红色'], [165, 42, 42, '棕红色'], [139, 69, 19, '马鞍棕'],
    [210, 105, 30, '巧克力色'], [111, 78, 55, '咖啡色'], [128, 128, 128, '灰色'],
    [64, 64, 64, '深灰色'], [211, 211, 211, '浅灰色'], [192, 192, 192, '银灰色'],
    [245, 245, 245, '烟白色'], [22, 119, 255, '品牌蓝'], [250, 173, 20, '琥珀色'],
    [82, 196, 26, '翠绿'], [114, 46, 209, '紫罗蓝'], [19, 194, 194, '青蓝'],
    [140, 130, 120, '暖灰色']
  ];

  const HUE_NAMES = [
    [15, '红'], [40, '橙'], [67, '黄'], [92, '黄绿'],
    [130, '绿'], [160, '青绿'], [185, '青'], [210, '青蓝'],
    [240, '蓝'], [270, '蓝紫'], [300, '紫'], [322, '玫红'], [345, '品红'], [360, '红']
  ];

  function hueName(h) {
    h = mod(h, 360);
    for (let i = 0; i < HUE_NAMES.length; i++) {
      if (h < HUE_NAMES[i][0]) return HUE_NAMES[i][1];
    }
    return '红';
  }

  ColorMath.nameColor = function (r, g, b) {
    // 1. 精确/近色匹配
    let best = null, bestD = Infinity;
    for (let i = 0; i < NAMED_COLORS.length; i++) {
      const nc = NAMED_COLORS[i];
      const d = Math.sqrt(
        (r - nc[0]) * (r - nc[0]) * 0.3 +
        (g - nc[1]) * (g - nc[1]) * 0.59 +
        (b - nc[2]) * (b - nc[2]) * 0.11
      );
      if (d < bestD) { bestD = d; best = nc; }
    }
    if (best && bestD < 26) return best[3];

    // 2. HSV 规则命名
    const hsv = ColorMath.rgbToHsv(r, g, b);
    const hsl = ColorMath.rgbToHsl(r, g, b);
    const hn = hueName(hsv.h);

    if (hsv.s < 0.10) {
      // 灰度系
      const warm = (r > b + 6);
      const cool = (b > r + 6);
      const tone = warm ? '暖灰' : cool ? '冷灰' : '灰';
      if (hsv.v < 0.06) return '黑色';
      if (hsv.v < 0.22) return '近黑色';
      if (hsv.v < 0.42) return '深' + tone;
      if (hsv.v < 0.62) return tone + '色';
      if (hsv.v < 0.82) return '浅' + tone;
      if (hsv.v < 0.95) return '近白色';
      return '白色';
    }

    // 粉色判定（红/玫红/品红区 + 高明度）
    if ((hsv.h < 345 || hsv.h > 300) && hsl.l > 0.72 && hsv.s < 0.75) {
      return '粉红色';
    }

    if (hsv.v < 0.22) return '墨' + hn;
    if (hsv.v < 0.42) return '深' + hn;
    if (hsv.s < 0.28) return '灰' + hn;
    if (hsl.l > 0.86 && hsv.s < 0.55) return '浅' + hn;
    if (hsv.s > 0.88 && hsv.v > 0.9) return '亮' + hn;
    if (hsv.s < 0.5 && hsv.v > 0.7) return '柔和' + hn;
    return hn + '色';
  };

  /* ---------- 色差工具（简单加权 RGB / ΔE76） ---------- */
  ColorMath.rgbDistance = function (c1, c2) {
    return Math.sqrt(
      (c1.r - c2.r) * (c1.r - c2.r) * 0.3 +
      (c1.g - c2.g) * (c1.g - c2.g) * 0.59 +
      (c1.b - c2.b) * (c1.b - c2.b) * 0.11
    );
  };

  ColorMath.deltaE76 = function (c1, c2) {
    const a = ColorMath.rgbToLab(c1.r, c1.g, c1.b);
    const b = ColorMath.rgbToLab(c2.r, c2.g, c2.b);
    return Math.sqrt(
      (a.l - b.l) * (a.l - b.l) +
      (a.a - b.a) * (a.a - b.a) +
      (a.b - b.b) * (a.b - b.b)
    );
  };

  // 混合两个颜色（t:0=c1,1=c2），含 alpha
  ColorMath.mix = function (c1, c2, t) {
    return {
      r: c1.r + (c2.r - c1.r) * t,
      g: c1.g + (c2.g - c1.g) * t,
      b: c1.b + (c2.b - c1.b) * t,
      a: (c1.a === undefined ? 1 : c1.a) + ((c2.a === undefined ? 1 : c2.a) - (c1.a === undefined ? 1 : c1.a)) * t
    };
  };

  global.ColorMath = ColorMath;
})(typeof window !== 'undefined' ? window : this);
