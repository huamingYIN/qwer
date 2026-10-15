/* ============================================================
 * ColorStudio Pro - export.js
 * 导出：PNG 色板图 / SVG / JSON / CSS / TXT / GPL / ASE / 数据备份
 * ============================================================ */
(function (global) {
  'use strict';

  const C = global.ColorMath;
  const P = global.Palette;
  const Store = global.Store;
  const Exporter = {};

  /* ---------- 文件下载 ---------- */
  Exporter.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 300);
  };

  function stamp() {
    const d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  /* ---------- 导出用色板集合 ----------
   * 规则：收藏夹有颜色 -> 使用收藏；否则使用当前颜色的 50–900 色阶
   */
  function boardColors() {
    const fav = Store.getFavorites();
    if (fav.length) {
      return fav.map(function (f) {
        return { name: f.name, r: f.r, g: f.g, b: f.b, a: f.a === undefined ? 1 : f.a };
      });
    }
    const cur = Store.getCurrent();
    return P.shades(cur).map(function (s) {
      return { name: 'primary-' + s.label, r: s.color.r, g: s.color.g, b: s.color.b, a: 1 };
    });
  }
  Exporter.boardColors = boardColors;

  function hex(c) { return C.rgbToHex(c.r, c.g, c.b, c.a); }
  function rgbText(c) { return Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b); }
  function cmykText(c) {
    const k = C.rgbToCmyk(c.r, c.g, c.b);
    return C.round(k.c * 100) + '%, ' + C.round(k.m * 100) + '%, ' +
      C.round(k.y * 100) + '%, ' + C.round(k.k * 100) + '%';
  }
  function hslText(c) {
    const h = C.rgbToHsl(c.r, c.g, c.b);
    return C.round(h.h) + '°, ' + C.round(h.s * 100) + '%, ' + C.round(h.l * 100) + '%';
  }

  /* ============================================================
   * JSON 色板
   * ============================================================ */
  Exporter.buildJSON = function (colors) {
    const payload = {
      tool: 'ColorStudio Pro',
      subtitle: '专业色彩识别 · 调色 · 配色 · 吸色工具',
      exported: new Date().toISOString(),
      count: colors.length,
      colors: colors.map(function (c) {
        const cm = C.rgbToCmyk(c.r, c.g, c.b);
        const hl = C.rgbToHsl(c.r, c.g, c.b);
        return {
          name: c.name,
          hex: hex(c),
          rgb: { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) },
          hsl: { h: C.round(hl.h), s: C.round(hl.s * 100), l: C.round(hl.l * 100) },
          cmyk: {
            c: C.round(cm.c * 100), m: C.round(cm.m * 100),
            y: C.round(cm.y * 100), k: C.round(cm.k * 100)
          }
        };
      })
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  };

  /* ============================================================
   * CSS 样式
   * ============================================================ */
  Exporter.buildCSS = function (colors) {
    const lines = [
      '/* ============================================',
      ' * ColorStudio Pro 色板 - 导出时间 ' + new Date().toLocaleString(),
      ' * ============================================ */',
      ':root {'
    ];
    colors.forEach(function (c, i) {
      const slug = 'color-' + (i + 1);
      lines.push('  --' + slug + ': ' + hex(c) + ';');
      lines.push('  --' + slug + '-rgb: ' + rgbText(c) + ';');
    });
    lines.push('}');
    colors.forEach(function (c, i) {
      lines.push('');
      lines.push('/* ' + c.name + ' ' + hex(c) + ' */');
      lines.push('.text-color-' + (i + 1) + ' { color: ' + hex(c) + '; }');
      lines.push('.bg-color-' + (i + 1) + ' { background-color: ' + hex(c) + '; }');
    });
    return new Blob([lines.join('\n')], { type: 'text/css;charset=utf-8' });
  };

  /* ============================================================
   * TXT 文本
   * ============================================================ */
  Exporter.buildTXT = function (colors) {
    const lines = [
      'ColorStudio Pro 色板',
      '专业色彩识别 · 调色 · 配色 · 吸色工具',
      '导出时间：' + new Date().toLocaleString(),
      '共 ' + colors.length + ' 个颜色',
      '============================================'
    ];
    colors.forEach(function (c, i) {
      lines.push('');
      lines.push((i + 1) + '. ' + c.name);
      lines.push('   HEX  ' + hex(c));
      lines.push('   RGB  ' + rgbText(c));
      lines.push('   HSL  ' + hslText(c));
      lines.push('   CMYK ' + cmykText(c));
    });
    return new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  };

  /* ============================================================
   * GPL 色板（GIMP / Inkscape）
   * ============================================================ */
  Exporter.buildGPL = function (colors) {
    const lines = [
      'GIMP Palette',
      'Name: ColorStudio Pro',
      'Columns: 5',
      '#'
    ];
    colors.forEach(function (c) {
      lines.push(
        Math.round(c.r) + ' ' + Math.round(c.g) + ' ' + Math.round(c.b) + '\t' + c.name
      );
    });
    return new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  };

  /* ============================================================
   * ASE 色板（Adobe Swatch Exchange，二进制）
   * 规范：ASEF 头 + COLOR ENTRY BLOCK（RGB, Big Endian）
   * ============================================================ */
  Exporter.buildASE = function (colors) {
    const blocks = colors.map(function (c) {
      const chars = [];
      const name = c.name;
      for (let i = 0; i < name.length; i++) chars.push(name.charCodeAt(i));
      chars.push(0x0000); // null 终止
      const nameBytes = chars.length * 2;
      // block body: nameLength(2) + name + model(4) + 3*float32(12) + colorType(2)
      const bodyLen = 2 + nameBytes + 4 + 12 + 2;
      return { chars: chars, bodyLen: bodyLen, c: c };
    });

    let total = 12; // signature(4)+version(4)+count(4)
    blocks.forEach(function (b) { total += 2 + 4 + b.bodyLen; });

    const buf = new ArrayBuffer(total);
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);

    u8.set([0x41, 0x53, 0x45, 0x46], 0); // "ASEF"
    dv.setUint16(4, 1); // version 1.0
    dv.setUint16(6, 0);
    dv.setUint32(8, colors.length);

    let off = 12;
    blocks.forEach(function (b) {
      dv.setUint16(off, 0x0001); off += 2;          // block type: color entry
      dv.setUint32(off, b.bodyLen); off += 4;       // block length
      dv.setUint16(off, b.chars.length); off += 2;  // name length (incl null)
      b.chars.forEach(function (ch) { dv.setUint16(off, ch); off += 2; });
      u8.set([0x52, 0x47, 0x42, 0x20], off); off += 4; // "RGB "
      dv.setFloat32(off, b.c.r / 255); off += 4;
      dv.setFloat32(off, b.c.g / 255); off += 4;
      dv.setFloat32(off, b.c.b / 255); off += 4;
      dv.setUint16(off, 0x0000); off += 2;          // color type: global
    });

    return new Blob([buf], { type: 'application/vnd.adobe.swatches' });
  };

  /* ============================================================
   * SVG 矢量色板
   * ============================================================ */
  const LAYOUT = {
    W: 1080, padX: 42, blockW: 180, blockH: 180,
    gapX: 24, pitchY: 284, headerH: 170
  };

  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  Exporter.buildSVG = function (colors) {
    const L = LAYOUT;
    const rows = Math.ceil(colors.length / 5);
    const H = L.headerH + rows * L.pitchY + 40;
    const parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + L.W + '" height="' + H + '" viewBox="0 0 ' + L.W + ' ' + H + '">',
      '<rect width="100%" height="100%" fill="#FFFFFF"/>',
      '<text x="' + L.padX + '" y="64" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="38" font-weight="700" fill="#1F2329">ColorStudio <tspan fill="#1677FF">Pro</tspan></text>',
      '<text x="' + L.padX + '" y="98" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="18" fill="#8A9099">专业色彩识别 · 调色 · 配色 · 吸色工具</text>',
      '<text x="' + L.padX + '" y="138" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="22" font-weight="600" fill="#1F2329">色板（' + colors.length + ' 色） · ' + escXml(new Date().toLocaleDateString()) + '</text>',
      '<line x1="' + L.padX + '" y1="158" x2="' + (L.W - L.padX) + '" y2="158" stroke="#E5E8EF" stroke-width="1"/>'
    ];

    colors.forEach(function (c, i) {
      const row = Math.floor(i / 5), col = i % 5;
      const x = L.padX + col * (L.blockW + L.gapX);
      const y = L.headerH + row * L.pitchY;
      parts.push('<rect x="' + x + '" y="' + y + '" width="' + L.blockW + '" height="' + L.blockH + '" rx="16" fill="' + hex(c) + '"/>');
      parts.push('<rect x="' + x + '" y="' + y + '" width="' + L.blockW + '" height="' + L.blockH + '" rx="16" fill="none" stroke="#E5E8EF" stroke-width="1"/>');
      parts.push('<text x="' + x + '" y="' + (y + 206) + '" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="18" font-weight="600" fill="#1F2329">' + escXml(c.name) + '</text>');
      parts.push('<text x="' + x + '" y="' + (y + 232) + '" font-family="Consolas, monospace" font-size="17" fill="#1677FF">' + hex(c) + '</text>');
      parts.push('<text x="' + x + '" y="' + (y + 254) + '" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="14" fill="#646A73">RGB ' + rgbText(c) + '</text>');
      parts.push('<text x="' + x + '" y="' + (y + 274) + '" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="14" fill="#646A73">CMYK ' + cmykText(c) + '</text>');
    });

    parts.push('</svg>');
    return new Blob([parts.join('\n')], { type: 'image/svg+xml;charset=utf-8' });
  };

  /* ============================================================
   * PNG 色板图片（Canvas 绘制，打印 / 客户确认级）
   * ============================================================ */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  Exporter.buildPNG = function (colors) {
    const L = LAYOUT;
    const rows = Math.ceil(colors.length / 5);
    const H = L.headerH + rows * L.pitchY + 40;
    const dpr = 2; // 高清输出
    const canvas = document.createElement('canvas');
    canvas.width = L.W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, L.W, H);

    // 顶部装饰条
    const grad = ctx.createLinearGradient(0, 0, L.W, 0);
    grad.addColorStop(0, '#FF5F6D');
    grad.addColorStop(0.5, '#1677FF');
    grad.addColorStop(1, '#2EE6A6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, L.W, 6);

    // 标题
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#1F2329';
    ctx.font = '700 38px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('ColorStudio ', L.padX, 64);
    const tw = ctx.measureText('ColorStudio ').width;
    ctx.fillStyle = '#1677FF';
    ctx.fillText('Pro', L.padX + tw, 64);

    ctx.fillStyle = '#8A9099';
    ctx.font = '18px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('专业色彩识别 · 调色 · 配色 · 吸色工具', L.padX, 98);

    ctx.fillStyle = '#1F2329';
    ctx.font = '600 22px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('色板（' + colors.length + ' 色） · ' + new Date().toLocaleDateString(), L.padX, 138);

    ctx.strokeStyle = '#E5E8EF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.padX, 158);
    ctx.lineTo(L.W - L.padX, 158);
    ctx.stroke();

    // 色块与信息
    colors.forEach(function (c, i) {
      const row = Math.floor(i / 5), col = i % 5;
      const x = L.padX + col * (L.blockW + L.gapX);
      const y = L.headerH + row * L.pitchY;

      roundRect(ctx, x, y, L.blockW, L.blockH, 16);
      ctx.fillStyle = hex(c);
      ctx.fill();
      ctx.strokeStyle = '#E5E8EF';
      ctx.stroke();

      ctx.fillStyle = '#1F2329';
      ctx.font = '600 18px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.fillText(c.name.slice(0, 12), x, y + 206);

      ctx.fillStyle = '#1677FF';
      ctx.font = '17px Consolas, "Courier New", monospace';
      ctx.fillText(hex(c), x, y + 232);

      ctx.fillStyle = '#646A73';
      ctx.font = '14px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.fillText('RGB ' + rgbText(c), x, y + 254);
      ctx.fillText('CMYK ' + cmykText(c), x, y + 274);
    });

    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, 'image/png');
    });
  };

  /* ============================================================
   * 统一导出入口
   * ============================================================ */
  Exporter.export = function (type) {
    if (type === 'backup') {
      const blob = new Blob([Store.exportAll()], { type: 'application/json;charset=utf-8' });
      Exporter.download(blob, 'ColorStudioPro_数据备份_' + stamp() + '.json');
      return;
    }

    const colors = boardColors();
    if (!colors.length) return;

    switch (type) {
      case 'json':
        Exporter.download(Exporter.buildJSON(colors), 'ColorStudioPro_色板_' + stamp() + '.json');
        break;
      case 'css':
        Exporter.download(Exporter.buildCSS(colors), 'ColorStudioPro_色板_' + stamp() + '.css');
        break;
      case 'txt':
        Exporter.download(Exporter.buildTXT(colors), 'ColorStudioPro_色板_' + stamp() + '.txt');
        break;
      case 'gpl':
        Exporter.download(Exporter.buildGPL(colors), 'ColorStudioPro_色板_' + stamp() + '.gpl');
        break;
      case 'ase':
        Exporter.download(Exporter.buildASE(colors), 'ColorStudioPro_色板_' + stamp() + '.ase');
        break;
      case 'svg':
        Exporter.download(Exporter.buildSVG(colors), 'ColorStudioPro_色板_' + stamp() + '.svg');
        break;
      case 'png':
        Exporter.buildPNG(colors).then(function (blob) {
          Exporter.download(blob, 'ColorStudioPro_色板图_' + stamp() + '.png');
        });
        break;
    }
  };

  global.Exporter = Exporter;
})(typeof window !== 'undefined' ? window : this);
