/* ============================================================
 * ColorStudio Pro - palette.js
 * 配色方案生成 / 明暗色阶 / WCAG 对比度 / 渐变 CSS / 随机色
 * ============================================================ */
(function (global) {
  'use strict';

  const C = global.ColorMath;
  const Palette = {};

  function hsv(h, s, v) {
    const rgb = C.hsvToRgb(h, s, v);
    return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
  }

  /* ============================================================
   * 自动配色方案
   * 输入主色（任意可解析颜色），输出 { 方案名: [5 个颜色] }
   * 每个方案第一个颜色即为主色本身
   * ============================================================ */
  Palette.SCHEME_NAMES = [
    ['monochrome', '单色配色'],
    ['analogous', '类似色'],
    ['complementary', '互补色'],
    ['split', '分裂互补色'],
    ['triadic', '三角色'],
    ['tetradic', '四角色'],
    ['doubleComp', '双互补色'],
    ['warm', '暖色方案'],
    ['cool', '冷色方案'],
    ['soft', '柔和配色'],
    ['highContrast', '高对比配色']
  ];

  Palette.fromColor = function (color) {
    const hsv0 = C.rgbToHsv(color.r, color.g, color.b);
    const h = hsv0.h, s = hsv0.s, v = hsv0.v;
    const main = hsv(h, s, v);

    const schemes = {};

    // 单色：同色相饱和度，明度阶梯
    schemes.monochrome = [
      main,
      hsv(h, s, Math.min(1, v * 1.18 + 0.04)),
      hsv(h, s, v * 0.82),
      hsv(h, Math.max(0.1, s * 0.9), v * 0.58),
      hsv(h, Math.max(0.1, s * 0.8), v * 0.34)
    ];

    // 类似色
    schemes.analogous = [
      main,
      hsv(C.mod(h - 28, 360), s, v),
      hsv(C.mod(h + 28, 360), s, v),
      hsv(C.mod(h - 55, 360), Math.max(0.15, s * 0.9), Math.min(1, v * 0.96)),
      hsv(C.mod(h + 55, 360), Math.max(0.15, s * 0.9), Math.min(1, v * 1.04))
    ];

    // 互补色
    schemes.complementary = [
      main,
      hsv(C.mod(h + 180, 360), s, v),
      hsv(h, s, v * 0.62),
      hsv(C.mod(h + 180, 360), Math.max(0.15, s * 0.65), Math.min(1, v * 1.08)),
      hsv(h, Math.max(0.12, s * 0.45), Math.min(1, v * 1.12))
    ];

    // 分裂互补
    schemes.split = [
      main,
      hsv(C.mod(h + 150, 360), s, v),
      hsv(C.mod(h + 210, 360), s, v),
      hsv(h, s, v * 0.6),
      hsv(C.mod(h + 180, 360), Math.max(0.12, s * 0.5), Math.min(1, v * 1.1))
    ];

    // 三角色
    schemes.triadic = [
      main,
      hsv(C.mod(h + 120, 360), s, v),
      hsv(C.mod(h + 240, 360), s, v),
      hsv(h, Math.max(0.2, s * 0.85), v * 0.7),
      hsv(C.mod(h + 120, 360), Math.max(0.2, s * 0.8), Math.min(1, v * 0.9))
    ];

    // 四角色（矩形）
    schemes.tetradic = [
      main,
      hsv(C.mod(h + 90, 360), s, v),
      hsv(C.mod(h + 180, 360), s, v),
      hsv(C.mod(h + 270, 360), s, v),
      hsv(h, s, v * 0.6)
    ];

    // 双互补色（两对互补）
    schemes.doubleComp = [
      main,
      hsv(C.mod(h + 180, 360), s, v),
      hsv(C.mod(h + 35, 360), s, v),
      hsv(C.mod(h + 215, 360), s, v),
      hsv(h, s, v * 0.62)
    ];

    // 暖色方案
    const warmHues = [12, 32, 46, 0, 26];
    schemes.warm = warmHues.map(function (dh, i) {
      return hsv(dh, i === 3 ? Math.max(0.3, s) : Math.max(0.55, s * 0.95),
        i === 4 ? v * 0.72 : Math.min(1, v * (0.92 + i * 0.04)));
    });
    schemes.warm[0] = main;

    // 冷色方案
    const coolHues = [205, 225, 190, 250, 175];
    schemes.cool = coolHues.map(function (hh, i) {
      return hsv(hh, Math.max(0.4, s * (i === 3 ? 1 : 0.9)),
        i === 4 ? v * 0.72 : Math.min(1, v * (0.95 + (i % 2) * 0.06)));
    });
    schemes.cool[0] = main;

    // 柔和配色（降低饱和度）
    schemes.soft = [
      main,
      hsv(C.mod(h - 18, 360), Math.max(0.1, s * 0.35), Math.min(1, v * 1.05)),
      hsv(C.mod(h + 18, 360), Math.max(0.1, s * 0.35), Math.min(1, v * 1.05)),
      hsv(C.mod(h + 180, 360), Math.max(0.1, s * 0.3), Math.min(1, v * 1.02)),
      hsv(h, Math.max(0.08, s * 0.28), v * 0.78)
    ];

    // 高对比配色
    schemes.highContrast = [
      main,
      { r: 255, g: 255, b: 255, a: 1 },
      hsv(C.mod(h + 180, 360), Math.max(0.85, s), Math.min(1, v)),
      { r: 18, g: 18, b: 18, a: 1 },
      hsv(C.mod(h + 180, 360), Math.max(0.6, s * 0.7), Math.min(1, v * 1.1))
    ];

    return schemes;
  };

  /* ============================================================
   * 明暗色阶（UI 色阶 50–900）
   * 50–400 向白色混合，500 为原色，600–900 向黑色混合
   * ============================================================ */
  Palette.SHADE_MIX = {
    50: { white: 0.96 },
    100: { white: 0.90 },
    200: { white: 0.76 },
    300: { white: 0.60 },
    400: { white: 0.32 },
    500: { white: 0 },
    600: { black: 0.15 },
    700: { black: 0.36 },
    800: { black: 0.60 },
    900: { black: 0.84 }
  };

  Palette.shades = function (color) {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const out = [];
    Object.keys(Palette.SHADE_MIX).forEach(function (label) {
      const spec = Palette.SHADE_MIX[label];
      let c;
      if (spec.white !== undefined && spec.white > 0) c = C.mix(color, white, spec.white);
      else if (spec.black !== undefined && spec.black > 0) c = C.mix(color, black, spec.black);
      else c = { r: color.r, g: color.g, b: color.b, a: color.a === undefined ? 1 : color.a };
      out.push({ label: label, color: { r: c.r, g: c.g, b: c.b, a: 1 } });
    });
    return out;
  };

  /* ============================================================
   * WCAG 2.1 对比度
   * ============================================================ */
  function channelLinear(v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  Palette.luminance = function (color) {
    return 0.2126 * channelLinear(color.r) +
      0.7152 * channelLinear(color.g) +
      0.0722 * channelLinear(color.b);
  };

  Palette.contrastRatio = function (c1, c2) {
    const l1 = Palette.luminance(c1);
    const l2 = Palette.luminance(c2);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };

  // 返回各级别是否通过
  Palette.rate = function (ratio) {
    return {
      normalAA: ratio >= 4.5,
      largeAA: ratio >= 3,
      normalAAA: ratio >= 7,
      largeAAA: ratio >= 4.5
    };
  };

  // 给定背景色，推荐黑/白文字
  Palette.suggestText = function (bg) {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const rBlack = Palette.contrastRatio(bg, black);
    const rWhite = Palette.contrastRatio(bg, white);
    return {
      black: { color: black, ratio: rBlack },
      white: { color: white, ratio: rWhite },
      best: rBlack >= rWhite ? 'black' : 'white'
    };
  };

  /* ============================================================
   * 60/30/10 配色
   * ============================================================ */
  Palette.ratio603010 = function (color) {
    const hsv0 = C.rgbToHsv(color.r, color.g, color.b);
    const primary = { r: color.r, g: color.g, b: color.b, a: 1 };
    const secondaryRgb = C.hsvToRgb(C.mod(hsv0.h + 28, 360),
      Math.max(0.18, hsv0.s * 0.55), Math.min(1, hsv0.v * 1.06));
    const accentRgb = C.hsvToRgb(C.mod(hsv0.h + 180, 360),
      Math.max(0.7, hsv0.s), Math.min(1, hsv0.v));
    return {
      primary: primary,
      secondary: { r: secondaryRgb.r, g: secondaryRgb.g, b: secondaryRgb.b, a: 1 },
      accent: { r: accentRgb.r, g: accentRgb.g, b: accentRgb.b, a: 1 }
    };
  };

  /* ============================================================
   * 渐变 CSS
   * stops: [{color:{r,g,b,a}, pos:0-100}]
   * ============================================================ */
  function rgba(c) {
    return 'rgba(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' +
      Math.round(c.b) + ', ' + C.round(c.a === undefined ? 1 : c.a, 3) + ')';
  }

  Palette.gradientCss = function (type, angle, stops) {
    const list = stops
      .slice()
      .sort(function (a, b) { return a.pos - b.pos; })
      .map(function (s) {
        return rgba(s.color) + ' ' + C.round(s.pos, 1) + '%';
      })
      .join(', ');
    if (type === 'radial') return 'radial-gradient(circle, ' + list + ')';
    return 'linear-gradient(' + C.round(angle, 1) + 'deg, ' + list + ')';
  };

  /* ============================================================
   * 随机颜色 / 随机配色
   * ============================================================ */
  Palette.randomColor = function () {
    return {
      r: Math.floor(Math.random() * 256),
      g: Math.floor(Math.random() * 256),
      b: Math.floor(Math.random() * 256),
      a: 1
    };
  };

  // 视觉上更协调的随机色（HSL 随机，饱和度明度适中偏高）
  Palette.randomPleasant = function () {
    const rgb = C.hslToRgb(
      Math.floor(Math.random() * 360),
      0.55 + Math.random() * 0.4,
      0.45 + Math.random() * 0.3
    );
    return { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 };
  };

  Palette.randomScheme = function () {
    const base = Palette.randomPleasant();
    return Palette.fromColor(base);
  };

  /* ============================================================
   * CSS 变量 / Tailwind 输出
   * ============================================================ */
  Palette.cssVariables = function (color) {
    const r = Palette.ratio603010(color);
    const suggest = Palette.suggestText(r.primary);
    const text = suggest.best === 'white' ? suggest.white.color : suggest.black.color;
    const lines = [
      ':root {',
      '  --primary: ' + C.rgbToHex(r.primary.r, r.primary.g, r.primary.b) + ';',
      '  --secondary: ' + C.rgbToHex(r.secondary.r, r.secondary.g, r.secondary.b) + ';',
      '  --accent: ' + C.rgbToHex(r.accent.r, r.accent.g, r.accent.b) + ';',
      '  --background: #FFFFFF;',
      '  --text: ' + C.rgbToHex(text.r, text.g, text.b) + ';',
      '  --primary-rgb: ' + Math.round(r.primary.r) + ', ' +
        Math.round(r.primary.g) + ', ' + Math.round(r.primary.b) + ';',
      '}'
    ];
    return lines.join('\n');
  };

  Palette.tailwindConfig = function (color) {
    const shades = Palette.shades(color);
    const lines = ['// tailwind.config.js  colors 配置', "module.exports = {", '  theme: {', '    extend: {', '      colors: {', '        primary: {'];
    shades.forEach(function (s) {
      lines.push("          '" + s.label + "': '" + C.rgbToHex(s.color.r, s.color.g, s.color.b) + "',");
    });
    lines.push('        },');
    lines.push('      },');
    lines.push('    },');
    lines.push('  },');
    lines.push('};');
    return lines.join('\n');
  };

  global.Palette = Palette;
})(typeof window !== 'undefined' ? window : this);
