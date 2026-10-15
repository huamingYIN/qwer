/* ============================================================
 * ColorStudio Pro - picker.js
 * 屏幕吸色(EyeDropper) / 图片像素读取 / 放大镜 / 图片颜色分析
 * ============================================================ */
(function (global) {
  'use strict';

  const C = global.ColorMath;
  const Picker = {};

  /* ============================================================
   * 屏幕吸色：EyeDropper API（Chromium 系支持）
   * ============================================================ */
  Picker.supportsEyeDropper = function () {
    return typeof global.EyeDropper !== 'undefined';
  };

  // Promise 始终 resolve：成功返回 {r,g,b,a}，取消/不支持返回 null
  Picker.pickScreen = function () {
    return new Promise(function (resolve) {
      if (!Picker.supportsEyeDropper()) { resolve(null); return; }
      try {
        const eye = new global.EyeDropper();
        eye.open().then(function (result) {
          if (result && result.sRGBHex) {
            const parsed = C.parseHex(result.sRGBHex);
            resolve(parsed);
          } else resolve(null);
        }).catch(function () {
          // 用户按 Esc 取消
          resolve(null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  };

  /* ============================================================
   * 图片像素坐标换算与读取
   * ============================================================ */

  // 鼠标事件 -> 图片自然像素坐标
  Picker.eventToNatural = function (canvas, naturalWidth, naturalHeight, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = C.clamp(
      Math.floor((clientX - rect.left) / rect.width * naturalWidth),
      0, naturalWidth - 1
    );
    const y = C.clamp(
      Math.floor((clientY - rect.top) / rect.height * naturalHeight),
      0, naturalHeight - 1
    );
    return { x: x, y: y };
  };

  // 从 canvas 上下文读取单像素
  Picker.getPixel = function (ctx, x, y) {
    const d = ctx.getImageData(x, y, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };

  /* ============================================================
   * 放大镜绘制
   * loupeCanvas: 238x238，显示 17x17 像素（半径 8），每格 14px
   * ============================================================ */
  Picker.LOUPE_RADIUS = 8;
  Picker.LOUPE_N = 17;

  Picker.drawLoupe = function (loupeCanvas, img, px, py) {
    const ctx = loupeCanvas.getContext('2d');
    const n = Picker.LOUPE_N;
    const size = loupeCanvas.width;
    const cell = size / n;
    const r = Picker.LOUPE_RADIUS;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    // 源区域可能超出图片边界：先画到临时 canvas 再平铺，避免 drawImage 缩放异常
    const tmp = document.createElement('canvas');
    tmp.width = n; tmp.height = n;
    const tctx = tmp.getContext('2d');
    tctx.imageSmoothingEnabled = false;

    const sx = px - r, sy = py - r;
    // 安全区域（与图片重叠部分）
    const ox = Math.max(0, -sx), oy = Math.max(0, -sy);
    const sw = n - Math.max(0, (sx + n) - img.naturalWidth) - ox;
    const sh = n - Math.max(0, (sy + n) - img.naturalHeight) - oy;
    if (sw > 0 && sh > 0) {
      tctx.drawImage(img, sx + ox, sy + oy, sw, sh, ox, oy, sw, sh);
    }
    ctx.drawImage(tmp, 0, 0, n, n, 0, 0, size, size);

    // 像素网格
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      ctx.moveTo(i * cell + 0.5, 0);
      ctx.lineTo(i * cell + 0.5, size);
      ctx.moveTo(0, i * cell + 0.5);
      ctx.lineTo(size, i * cell + 0.5);
    }
    ctx.stroke();

    // 中心准星框
    ctx.strokeStyle = '#FF3B30';
    ctx.lineWidth = 2;
    ctx.strokeRect(r * cell, r * cell, cell, cell);
  };

  /* ============================================================
   * 图片主要颜色分析（均匀量化 + 相似色合并）
   * 返回 { colors:[{r,g,b,ratio}], otherRatio, total }
   * ============================================================ */
  function simpleDist(a, b) {
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
  }

  Picker.analyzeImage = function (img, topN) {
    const maxDim = 128;
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(natW, natH));
    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    try {
      ctx.drawImage(img, 0, 0, w, h);
    } catch (e) {
      return { colors: [], otherRatio: 0, total: 0 };
    }

    let pixels;
    try {
      pixels = ctx.getImageData(0, 0, w, h).data;
    } catch (e) {
      return { colors: [], otherRatio: 0, total: 0 };
    }

    const buckets = {};
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 24) continue; // 跳过近透明像素
      const ri = Math.min(15, Math.floor(pixels[i] / 16));
      const gi = Math.min(15, Math.floor(pixels[i + 1] / 16));
      const bi = Math.min(15, Math.floor(pixels[i + 2] / 16));
      const key = ri * 256 + gi * 16 + bi;
      let bk = buckets[key];
      if (!bk) {
        bk = { r: 0, g: 0, b: 0, count: 0 };
        buckets[key] = bk;
      }
      bk.r += pixels[i];
      bk.g += pixels[i + 1];
      bk.b += pixels[i + 2];
      bk.count++;
      total++;
    }

    if (!total) return { colors: [], otherRatio: 0, total: 0 };

    let arr = Object.keys(buckets).map(function (key) {
      const bk = buckets[key];
      return { r: bk.r / bk.count, g: bk.g / bk.count, b: bk.b / bk.count, count: bk.count };
    });
    arr.sort(function (a, b) { return b.count - a.count; });

    // 贪心合并近色（阈值 24）
    const merged = [];
    arr.forEach(function (bk) {
      let found = null;
      for (let i = 0; i < merged.length; i++) {
        if (simpleDist(merged[i], bk) < 24) { found = merged[i]; break; }
      }
      if (found) {
        const tc = found.count / (found.count + bk.count);
        found.r = found.r * tc + bk.r * (1 - tc);
        found.g = found.g * tc + bk.g * (1 - tc);
        found.b = found.b * tc + bk.b * (1 - tc);
        found.count += bk.count;
      } else {
        merged.push({ r: bk.r, g: bk.g, b: bk.b, count: bk.count });
      }
    });
    merged.sort(function (a, b) { return b.count - a.count; });

    const top = merged.slice(0, topN);
    let used = 0;
    top.forEach(function (c) { used += c.count; });

    return {
      colors: top.map(function (c) {
        return {
          r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b),
          ratio: c.count / total
        };
      }),
      otherRatio: Math.max(0, (total - used) / total),
      total: total
    };
  };

  global.Picker = Picker;
})(typeof window !== 'undefined' ? window : this);
