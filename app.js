/* ============================================================
 * ColorStudio Pro - app.js
 * 主界面控制：全部面板交互 / 撤销重做 / 快捷键 / 主题 / 数据
 * ============================================================ */
(function (global) {
  'use strict';

  const C = global.ColorMath;
  const P = global.Palette;

  function $(id) { return document.getElementById(id); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /* ============================================================
   * 全局状态
   * ============================================================ */
  let cur = { r: 22, g: 119, b: 255, a: 1 };
  let customName = '';

  let undoStack = [];
  let redoStack = [];
  let snapBefore = null;

  let settings;

  // 图片吸色
  const imageData = { img: null, ctx: null, canvas: null, picked: [] };
  let analysisN = 10;
  let analysisCache = null;
  let rafPending = false;
  let lastEv = null;

  // 渐变
  const gradState = { type: 'linear', angle: 90, stops: [] };

  // 对比度
  const contrastState = {
    fg: { r: 51, g: 51, b: 51, a: 1 },
    bg: { r: 255, g: 255, b: 255, a: 1 }
  };

  // 色板库
  let libTab = 'fav';
  let selectedFav = null;
  let selectedBrand = null;
  let selectedBrandColor = null;

  /* ============================================================
   * Toast
   * ============================================================ */
  let toastTimer = null;
  function toast(msg, ms) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.hidden = true; }, 200);
    }, ms || 1600);
  }

  /* ============================================================
   * 复制（含 file:// 下的 execCommand 兜底）
   * ============================================================ */
  function copyText(text) {
    const done = function () { toast('已复制'); };
    // 同步 execCommand 复制：必须在用户点击的同一调用栈内执行，
    // 才能保留用户激活，file:// 下这是最可靠的方式
    function legacyCopy() {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.left = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e) {
        return false;
      }
    }

    // file:// 或不支持 Clipboard API：直接同步复制
    if (window.location.protocol === 'file:' ||
        !navigator.clipboard || !navigator.clipboard.writeText) {
      if (legacyCopy()) done(); else toast('复制失败，请手动复制');
      return;
    }

    // 在线页面：优先现代 API，失败再同步兜底
    navigator.clipboard.writeText(text).then(done).catch(function () {
      if (legacyCopy()) done(); else toast('复制失败，请手动复制');
    });
  }

  /* ============================================================
   * 撤销 / 重做
   * ============================================================ */
  function cloneCur() {
    return { r: cur.r, g: cur.g, b: cur.b, a: cur.a };
  }

  // 连续操作（拖动）开始
  function beginChange() {
    if (!snapBefore) snapBefore = cloneCur();
  }

  // 连续操作结束：若变化则入栈
  function endChange() {
    if (!snapBefore) return;
    const s = snapBefore;
    if (s.r !== cur.r || s.g !== cur.g || s.b !== cur.b || s.a !== cur.a) {
      undoStack.push(s);
      if (undoStack.length > 50) undoStack.shift();
      redoStack = [];
      afterCommit();
    }
    snapBefore = null;
  }

  // 离散操作（点击色板 / 吸色 / 反转等）
  function submitColor(c) {
    undoStack.push(cloneCur());
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    cur = {
      r: c.r, g: c.g, b: c.b,
      a: c.a === undefined ? cur.a : c.a
    };
    afterCommit();
  }

  // 拖动中的实时更新（不入栈）
  function liveColor(c) {
    cur = {
      r: c.r, g: c.g, b: c.b,
      a: c.a === undefined ? cur.a : c.a
    };
    refresh(true);
  }

  // 一次完整提交后的公共动作
  function afterCommit() {
    Store.addHistory(cur);
    Store.setCurrent(cur, customName);
    refresh(false);
  }

  function undo() {
    if (!undoStack.length) { toast('没有可撤销的操作'); return; }
    redoStack.push(cloneCur());
    cur = undoStack.pop();
    Store.addHistory(cur);
    Store.setCurrent(cur, customName);
    refresh(false);
  }

  function redo() {
    if (!redoStack.length) { toast('没有可重做的操作'); return; }
    undoStack.push(cloneCur());
    cur = redoStack.pop();
    Store.addHistory(cur);
    Store.setCurrent(cur, customName);
    refresh(false);
  }

  /* ============================================================
   * 刷新界面
   * ============================================================ */
  function refresh(live) {
    updatePreviews();
    updateChannels();
    updateSV();
    updateValues();
    updateName();
    updateFavStar();
    if (!live) {
      renderSchemes();
      renderShades();
      renderRatio603010();
      renderHistory();
    }
  }

  function rgba(c) {
    return 'rgba(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' +
      Math.round(c.b) + ', ' + C.round(c.a === undefined ? 1 : c.a, 3) + ')';
  }

  function updatePreviews() {
    const bg = rgba(cur);
    $('top-color-dot').style.background = bg;
    $('current-preview-color').style.background = bg;
    $('top-color-hex').textContent = C.rgbToHex(cur.r, cur.g, cur.b, cur.a);
  }

  function updateName() {
    const auto = C.nameColor(cur.r, cur.g, cur.b);
    $('top-color-name').textContent = customName || auto;
    if (document.activeElement !== $('current-name')) {
      $('current-name').value = customName;
    }
    $('current-name').placeholder = auto;
  }

  function updateFavStar() {
    const star = $('btn-favorite-star');
    if (Store.isFavorite(cur)) star.classList.add('active');
    else star.classList.remove('active');
  }

  /* ---------- 通道滑块/数字 ---------- */
  function setVal(rangeId, numberId, v) {
    const r = $(rangeId), n = $(numberId);
    if (r && document.activeElement !== r) r.value = v;
    if (n && document.activeElement !== n) n.value = v;
  }
  function setSingle(id, v) {
    const el = $(id);
    if (el && document.activeElement !== el) el.value = v;
  }

  function activeCardId() {
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('.channel-card')) {
      return ae.closest('.channel-card').id;
    }
    return null;
  }

  function updateChannels() {
    const r = Math.round(cur.r), g = Math.round(cur.g), b = Math.round(cur.b);
    const ap = Math.round(cur.a * 100);
    const editing = activeCardId();

    if (editing !== 'card-rgb') {
      setVal('range-r', 'number-r', r);
      setVal('range-g', 'number-g', g);
      setVal('range-b', 'number-b', b);
      setVal('range-a-rgb', 'number-a-rgb', ap);
    }
    $('rgb-head').textContent = r + ' / ' + g + ' / ' + b;

    if (editing !== 'card-hsl') {
      const hsl = C.rgbToHsl(cur.r, cur.g, cur.b);
      const hh = C.round(hsl.h), hs = C.round(hsl.s * 100), hl = C.round(hsl.l * 100);
      setVal('range-hsl-h', 'number-hsl-h', hh);
      setVal('range-hsl-s', 'number-hsl-s', hs);
      setVal('range-hsl-l', 'number-hsl-l', hl);
      $('hsl-head').textContent = hh + '° / ' + hs + '% / ' + hl + '%';
    } else {
      $('hsl-head').textContent =
        document.getElementById('number-hsl-h').value + '° / ' +
        document.getElementById('number-hsl-s').value + '% / ' +
        document.getElementById('number-hsl-l').value + '%';
    }

    if (editing !== 'card-hsv') {
      const hsv = C.rgbToHsv(cur.r, cur.g, cur.b);
      const vh = C.round(hsv.h), vs = C.round(hsv.s * 100), vv = C.round(hsv.v * 100);
      setVal('range-hsv-h', 'number-hsv-h', vh);
      setVal('range-hsv-s', 'number-hsv-s', vs);
      setVal('range-hsv-v', 'number-hsv-v', vv);
      $('hsv-head').textContent = vh + '° / ' + vs + '% / ' + vv + '%';
    } else {
      $('hsv-head').textContent =
        document.getElementById('number-hsv-h').value + '° / ' +
        document.getElementById('number-hsv-s').value + '% / ' +
        document.getElementById('number-hsv-v').value + '%';
    }

    // CMYK 与 RGB 存在多对一关系（如 C=50,K=0 与 C=0,K=50 同色），
    // 编辑时整组保留用户输入，避免回算把通道"规范化"导致滑块跳动
    if (editing !== 'card-cmyk') {
      const cm = C.rgbToCmyk(cur.r, cur.g, cur.b);
      const cc = C.round(cm.c * 100), cmM = C.round(cm.m * 100);
      const cy = C.round(cm.y * 100), ck = C.round(cm.k * 100);
      setVal('range-cmyk-c', 'number-cmyk-c', cc);
      setVal('range-cmyk-m', 'number-cmyk-m', cmM);
      setVal('range-cmyk-y', 'number-cmyk-y', cy);
      setVal('range-cmyk-k', 'number-cmyk-k', ck);
      $('cmyk-head').textContent = cc + '% / ' + cmM + '% / ' + cy + '% / ' + ck + '%';
    } else {
      $('cmyk-head').textContent =
        document.getElementById('number-cmyk-c').value + '% / ' +
        document.getElementById('number-cmyk-m').value + '% / ' +
        document.getElementById('number-cmyk-y').value + '% / ' +
        document.getElementById('number-cmyk-k').value + '%';
    }

    $('print-notice').style.display = settings && settings.printNotice ? 'block' : 'none';
  }

  function readNum(id, fallback) {
    const el = $(id);
    const v = parseFloat(el.value);
    if (isNaN(v)) return fallback;
    return v;
  }

  function handleGroup(card) {
    if (card.id === 'card-rgb') {
      const r = C.clamp(readNum('number-r', cur.r), 0, 255);
      const g = C.clamp(readNum('number-g', cur.g), 0, 255);
      const b = C.clamp(readNum('number-b', cur.b), 0, 255);
      const a = C.clamp(readNum('number-a-rgb', cur.a * 100), 0, 100) / 100;
      liveColor({ r: r, g: g, b: b, a: a });
    } else if (card.id === 'card-hsl') {
      const hsl0 = C.rgbToHsl(cur.r, cur.g, cur.b);
      const h = C.clamp(readNum('number-hsl-h', hsl0.h), 0, 360);
      const s = C.clamp(readNum('number-hsl-s', hsl0.s * 100), 0, 100) / 100;
      const l = C.clamp(readNum('number-hsl-l', hsl0.l * 100), 0, 100) / 100;
      const rgb = C.hslToRgb(h, s, l);
      liveColor({ r: rgb.r, g: rgb.g, b: rgb.b, a: cur.a });
    } else if (card.id === 'card-hsv') {
      const hsv0 = C.rgbToHsv(cur.r, cur.g, cur.b);
      const h = C.clamp(readNum('number-hsv-h', hsv0.h), 0, 360);
      const s = C.clamp(readNum('number-hsv-s', hsv0.s * 100), 0, 100) / 100;
      const v = C.clamp(readNum('number-hsv-v', hsv0.v * 100), 0, 100) / 100;
      const rgb = C.hsvToRgb(h, s, v);
      liveColor({ r: rgb.r, g: rgb.g, b: rgb.b, a: cur.a });
    } else if (card.id === 'card-cmyk') {
      const cm0 = C.rgbToCmyk(cur.r, cur.g, cur.b);
      const cc = C.clamp(readNum('number-cmyk-c', cm0.c * 100), 0, 100) / 100;
      const cmM = C.clamp(readNum('number-cmyk-m', cm0.m * 100), 0, 100) / 100;
      const cy = C.clamp(readNum('number-cmyk-y', cm0.y * 100), 0, 100) / 100;
      const ck = C.clamp(readNum('number-cmyk-k', cm0.k * 100), 0, 100) / 100;
      const rgb = C.cmykToRgb(cc, cmM, cy, ck);
      liveColor({ r: rgb.r, g: rgb.g, b: rgb.b, a: cur.a });
    }
  }

  /* ============================================================
   * 二维选择器 / 色相 / 透明度
   * ============================================================ */
  function updateSV() {
    const hsv = C.rgbToHsv(cur.r, cur.g, cur.b);
    const hueColor = C.hslToRgb(hsv.h, 1, 0.5);
    const hueHex = C.rgbToHex(hueColor.r, hueColor.g, hueColor.b);
    $('sv-panel').style.background =
      'linear-gradient(to top, #000, rgba(0,0,0,0)), ' +
      'linear-gradient(to right, #FFF, ' + hueHex + ')';
    $('sv-cursor').style.left = (hsv.s * 100) + '%';
    $('sv-cursor').style.top = ((1 - hsv.v) * 100) + '%';

    $('hue-thumb').style.top = (hsv.h / 360 * 100) + '%';

    $('alpha-fill').style.background =
      'linear-gradient(to right, rgba(' + Math.round(cur.r) + ',' +
      Math.round(cur.g) + ',' + Math.round(cur.b) + ',0), rgba(' +
      Math.round(cur.r) + ',' + Math.round(cur.g) + ',' + Math.round(cur.b) + ',1))';
    $('alpha-thumb').style.left = (cur.a * 100) + '%';
  }

  function bindSV() {
    const panel = $('sv-panel');

    function posFromEvent(e) {
      const rect = panel.getBoundingClientRect();
      const s = C.clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const v = 1 - C.clamp((e.clientY - rect.top) / rect.height, 0, 1);
      const hsv0 = C.rgbToHsv(cur.r, cur.g, cur.b);
      const rgb = C.hsvToRgb(hsv0.h, s, v);
      return { r: rgb.r, g: rgb.g, b: rgb.b, a: cur.a };
    }

    panel.addEventListener('pointerdown', function (e) {
      beginChange();
      panel.setPointerCapture(e.pointerId);
      liveColor(posFromEvent(e));
    });
    panel.addEventListener('pointermove', function (e) {
      if (snapBefore) liveColor(posFromEvent(e));
    });
    panel.addEventListener('pointerup', function () { endChange(); });
    panel.addEventListener('pointercancel', function () { endChange(); });

    // 色相竖条
    const hue = $('hue-track');
    function hueFromEvent(e) {
      const rect = hue.getBoundingClientRect();
      const h = C.clamp((e.clientY - rect.top) / rect.height, 0, 1) * 360;
      const hsv0 = C.rgbToHsv(cur.r, cur.g, cur.b);
      return withVisibleS(hsv0, h);
    }
    hue.addEventListener('pointerdown', function (e) {
      beginChange();
      hue.setPointerCapture(e.pointerId);
      liveColor(hueFromEvent(e));
    });
    // 低饱和（近灰/近黑）时色相不可见且数值不稳定，
    // 点击色相条自动给予最小饱和度，让目标色相可见
    function withVisibleS(hsv0, h) {
      let s = hsv0.s;
      if (s < 0.12) s = 0.12;
      const rgb0 = C.hsvToRgb(h, s, hsv0.v);
      return { r: rgb0.r, g: rgb0.g, b: rgb0.b, a: cur.a };
    }
    hue.addEventListener('pointermove', function (e) {
      if (snapBefore) liveColor(hueFromEvent(e));
    });
    hue.addEventListener('pointerup', function () { endChange(); });
    hue.addEventListener('pointercancel', function () { endChange(); });

    // 透明度横条
    const alpha = $('alpha-track');
    function alphaFromEvent(e) {
      const rect = alpha.getBoundingClientRect();
      const a = C.clamp((e.clientX - rect.left) / rect.width, 0, 1);
      return { r: cur.r, g: cur.g, b: cur.b, a: a };
    }
    alpha.addEventListener('pointerdown', function (e) {
      beginChange();
      alpha.setPointerCapture(e.pointerId);
      liveColor(alphaFromEvent(e));
    });
    alpha.addEventListener('pointermove', function (e) {
      if (snapBefore) liveColor(alphaFromEvent(e));
    });
    alpha.addEventListener('pointerup', function () { endChange(); });
    alpha.addEventListener('pointercancel', function () { endChange(); });
  }

  /* ============================================================
   * 右侧数值列表
   * ============================================================ */
  const VALUE_ROWS = [
    ['HEX', function () { return C.format.hex(cur); }],
    ['RGB', function () { return C.format.rgb(cur); }],
    ['RGBA', function () { return C.format.rgba(cur); }],
    ['HSL', function () { return C.format.hsl(cur); }],
    ['HSV', function () { return C.format.hsv(cur); }],
    ['HSB', function () { return C.format.hsv(cur); }],
    ['CMYK', function () { return C.format.cmyk(cur); }],
    ['LAB', function () { return C.format.lab(cur); }],
    ['LCH', function () { return C.format.lch(cur); }],
    ['XYZ', function () { return C.format.xyz(cur); }]
  ];

  function updateValues() {
    const list = $('value-list');
    let html = '';
    VALUE_ROWS.forEach(function (row, i) {
      const val = row[1]();
      html += '<div class="value-row">' +
        '<span class="v-label">' + row[0] + '</span>' +
        '<code class="v-text" title="' + val + '">' + val + '</code>' +
        '<button class="copy-mini" data-copy="' + i + '" title="复制">复制</button>' +
        '</div>';
    });
    list.innerHTML = html;
  }

  /* ============================================================
   * 万能输入框
   * ============================================================ */
  function bindColorInput() {
    const input = $('color-input');
    const hint = $('input-hint');

    input.addEventListener('focus', function () { beginChange(); });

    input.addEventListener('input', function () {
      const v = input.value.trim();
      if (!v) {
        hint.textContent = '支持 HEX / RGB / RGBA / HSL / HSV / CMYK，回车应用';
        hint.className = 'input-hint';
        return;
      }
      const parsed = C.parse(v);
      if (parsed) {
        liveColor(parsed);
        hint.textContent = '识别成功，回车应用';
        hint.className = 'input-hint ok';
      } else {
        hint.textContent = '请输入正确的颜色格式';
        hint.className = 'input-hint err';
      }
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        const parsed = C.parse(input.value);
        if (parsed) {
          endChange();
          input.value = C.rgbToHex(cur.r, cur.g, cur.b, cur.a);
          hint.textContent = '支持 HEX / RGB / RGBA / HSL / HSV / CMYK，回车应用';
          hint.className = 'input-hint';
        } else {
          toast('请输入正确的颜色格式');
          hint.textContent = '请输入正确的颜色格式';
          hint.className = 'input-hint err';
        }
      }
    });

    input.addEventListener('blur', function () {
      if (snapBefore) {
        const parsed = C.parse(input.value);
        if (parsed) endChange();
        else { snapBefore = null; refresh(true); }
      }
      hint.textContent = '支持 HEX / RGB / RGBA / HSL / HSV / CMYK，回车应用';
      hint.className = 'input-hint';
    });
  }

  /* ============================================================
   * 图片导入 / 拖放
   * ============================================================ */
  function loadImageFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast('请选择 JPG / PNG / WEBP / BMP 图片文件');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      imageData.img = img;
      setupImageCanvas();
      runAnalysis();
      imageData.picked = [];
      renderImagePicked();
      $('drop-zone').hidden = true;
      $('image-workspace').hidden = false;
      switchPanel('image');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      toast('图片加载失败，请尝试其他图片');
    };
    img.src = url;
  }

  function setupImageCanvas() {
    const img = imageData.img;
    const cv = $('image-canvas');
    const ctx = cv.getContext('2d');
    const workspace = $('image-workspace');
    const maxW = Math.max(280, workspace.clientWidth - 28);
    const maxH = 470;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    cv.width = w;
    cv.height = h;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    imageData.ctx = ctx;
    imageData.canvas = cv;
  }

  function bindImageIO() {
    const fileInput = $('input-image-file');

    $('btn-import-image').addEventListener('click', function () { fileInput.click(); });
    $('btn-pick-image-file').addEventListener('click', function () { fileInput.click(); });
    $('btn-repick-image').addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', function () {
      const f = fileInput.files && fileInput.files[0];
      if (f) loadImageFile(f);
      fileInput.value = '';
    });

    // 拖放
    const dz = $('drop-zone');
    let dragDepth = 0;
    document.addEventListener('dragenter', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) {
        dragDepth++;
        dz.classList.add('dragging');
      }
    });
    document.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    document.addEventListener('dragleave', function () {
      dragDepth--;
      if (dragDepth <= 0) { dragDepth = 0; dz.classList.remove('dragging'); }
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      dragDepth = 0;
      dz.classList.remove('dragging');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadImageFile(f);
    });
  }

  /* ============================================================
   * 放大镜与图片取色
   * ============================================================ */
  function bindImagePicker() {
    const cv = $('image-canvas');
    const loupe = $('loupe');

    cv.addEventListener('pointermove', function (e) {
      lastEv = e;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(function () {
          rafPending = false;
          onImageMove(lastEv);
        });
      }
    });

    cv.addEventListener('pointerleave', function () {
      loupe.hidden = true;
    });

    cv.addEventListener('click', function (e) {
      const c = pixelForEvent(e);
      if (c) {
        submitColor(c);
        imageData.picked.unshift({
          id: Store.uid(),
          r: c.r, g: c.g, b: c.b, a: c.a
        });
        renderImagePicked();
      }
    });
  }

  function eventFraction(e) {
    const rect = imageData.canvas.getBoundingClientRect();
    return {
      fx: C.clamp((e.clientX - rect.left) / rect.width, 0, 1),
      fy: C.clamp((e.clientY - rect.top) / rect.height, 0, 1)
    };
  }

  function pixelForEvent(e) {
    if (!imageData.ctx) return null;
    const f = eventFraction(e);
    const px = Math.floor(f.fx * imageData.canvas.width);
    const py = Math.floor(f.fy * imageData.canvas.height);
    const d = imageData.ctx.getImageData(px, py, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  }

  function onImageMove(e) {
    if (!imageData.img || !imageData.ctx) return;
    const c = pixelForEvent(e);
    if (!c) return;
    const f = eventFraction(e);
    const nx = Math.floor(f.fx * imageData.img.naturalWidth);
    const ny = Math.floor(f.fy * imageData.img.naturalHeight);

    Picker.drawLoupe($('loupe-canvas'), imageData.img, nx, ny);
    $('loupe-rgb').textContent =
      'RGB ' + c.r + ', ' + c.g + ', ' + c.b;
    $('loupe-hex').textContent = C.rgbToHex(c.r, c.g, c.b, c.a);

    positionLoupe(e);
    $('loupe').hidden = false;
  }

  function positionLoupe(e) {
    const loupe = $('loupe');
    const cvRect = imageData.canvas.getBoundingClientRect();
    const wsRect = $('image-workspace').getBoundingClientRect();
    const LW = 250, LH = 308;
    let L = e.clientX - cvRect.left + 18;
    let T = e.clientY - cvRect.top - 36;
    if (L + LW > cvRect.width) L = e.clientX - cvRect.left - LW - 6;
    if (L < 0) L = 0;
    T = C.clamp(T, 0, Math.max(0, cvRect.height - LH));
    loupe.style.left = (cvRect.left - wsRect.left + L) + 'px';
    loupe.style.top = (cvRect.top - wsRect.top + T) + 'px';
  }

  function renderImagePicked() {
    const box = $('image-picked-list');
    if (!imageData.picked.length) {
      box.innerHTML = '<div class="empty-tip">在图片上点击即可吸取颜色</div>';
      return;
    }
    let html = '';
    imageData.picked.forEach(function (c) {
      const hex = C.rgbToHex(c.r, c.g, c.b, c.a);
      const title = hex + ' · rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      html += '<button class="mini-swatch" data-hex="' + hex + '" title="' + title +
        '" style="background:' + rgba(c) + '"><span class="mini-del" data-id="' +
        c.id + '">×</span></button>';
    });
    box.innerHTML = html;
  }

  /* ============================================================
   * 图片颜色分析
   * ============================================================ */
  function runAnalysis() {
    analysisCache = Picker.analyzeImage(imageData.img, 20);
    renderAnalysis();
  }

  function renderAnalysis() {
    const box = $('analysis-list');
    if (!analysisCache || !analysisCache.colors.length) {
      box.innerHTML = '<div class="empty-tip">未能分析出颜色</div>';
      return;
    }
    const colors = analysisCache.colors.slice(0, analysisN);
    let html = '';
    colors.forEach(function (c) {
      const hex = C.rgbToHex(c.r, c.g, c.b);
      const pct = C.round(c.ratio * 100, 1);
      html += '<button class="analysis-row" data-hex="' + hex + '">' +
        '<span class="an-color" style="background:' + hex + '"></span>' +
        '<span class="an-info"><code>' + hex + '</code><small>rgb(' +
        c.r + ',' + c.g + ',' + c.b + ')</small></span>' +
        '<span class="an-ratio"><span class="an-bar"><i style="width:' +
        (c.ratio * 100) + '%"></i></span><em>' + pct + '%</em></span>' +
        '</button>';
    });
    if (analysisCache.otherRatio > 0.005) {
      const pct = C.round(analysisCache.otherRatio * 100, 1);
      html += '<div class="analysis-row static">' +
        '<span class="an-color an-other"></span>' +
        '<span class="an-info"><code>其他颜色</code><small>合并的少量颜色</small></span>' +
        '<span class="an-ratio"><span class="an-bar"><i class="other-bar" style="width:' +
        (analysisCache.otherRatio * 100) + '%"></i></span><em>' + pct + '%</em></span>' +
        '</div>';
    }
    box.innerHTML = html;
  }

  /* ============================================================
   * 配色方案
   * ============================================================ */
  function renderSchemes() {
    const grid = $('scheme-grid');
    const schemes = P.fromColor(cur);
    let html = '';
    P.SCHEME_NAMES.forEach(function (pair) {
      const key = pair[0], label = pair[1];
      const colors = schemes[key];
      html += '<div class="scheme-card" data-scheme="' + key + '">';
      html += '<div class="scheme-head"><strong>' + label + '</strong>' +
        '<button class="mini-op" data-op="copy" title="复制整组 HEX">复制</button>' +
        '<button class="mini-op" data-op="fav" title="整组加入收藏">收藏</button></div>';
      html += '<div class="scheme-colors">';
      colors.forEach(function (c) {
        const hex = C.rgbToHex(c.r, c.g, c.b);
        const title = hex + ' · rgb(' + Math.round(c.r) + ',' +
          Math.round(c.g) + ',' + Math.round(c.b) + ')';
        html += '<button class="scheme-color" data-hex="' + hex +
          '" title="' + title + '" style="background:' + hex + '"></button>';
      });
      html += '</div></div>';
    });
    grid.innerHTML = html;
  }

  /* ============================================================
   * 明暗色阶
   * ============================================================ */
  function renderShades() {
    const box = $('shade-row');
    const shades = P.shades(cur);
    let html = '';
    shades.forEach(function (s) {
      const c = s.color;
      const hex = C.rgbToHex(c.r, c.g, c.b);
      const lum = P.luminance(c);
      const tc = lum > 0.6 ? '#1F2329' : '#FFFFFF';
      html += '<button class="shade" data-hex="' + hex + '" title="' + hex +
        '" style="background:' + hex + ';color:' + tc + '"><em>' +
        s.label + '</em></button>';
    });
    box.innerHTML = html;
  }

  /* ============================================================
   * 60 / 30 / 10
   * ============================================================ */
  function renderRatio603010() {
    const r = P.ratio603010(cur);
    const pHex = C.rgbToHex(r.primary.r, r.primary.g, r.primary.b);
    const sHex = C.rgbToHex(r.secondary.r, r.secondary.g, r.secondary.b);
    const aHex = C.rgbToHex(r.accent.r, r.accent.g, r.accent.b);

    const pSug = P.suggestText(r.primary);
    const pText = pSug.best === 'white' ? '#FFFFFF' : '#1F2329';
    const sSug = P.suggestText(r.secondary);
    const sText = sSug.best === 'white' ? '#FFFFFF' : '#1F2329';

    const header = $('ratio-header');
    header.style.background = pHex;
    header.style.color = pText;
    $('ratio-btn').style.background = aHex;
    const aSug = P.suggestText(r.accent);
    $('ratio-btn').style.color = aSug.best === 'white' ? '#FFFFFF' : '#1F2329';

    $('ratio-side').style.background = sHex;
    $('ratio-side').style.color = sText;
    $('ratio-cta').style.background = aHex;
    $('ratio-cta').style.color = aSug.best === 'white' ? '#FFFFFF' : '#1F2329';

    $('legend-primary').style.background = pHex;
    $('legend-secondary').style.background = sHex;
    $('legend-accent').style.background = aHex;
  }

  /* ============================================================
   * 渐变
   * ============================================================ */
  function initGradient() {
    const schemes = P.fromColor(cur);
    gradState.stops = [
      { color: { r: cur.r, g: cur.g, b: cur.b, a: 1 }, pos: 0 },
      { color: schemes.complementary[1], pos: 100 }
    ];
    gradState.angle = 90;
    gradState.type = 'linear';
  }

  function renderGradient() {
    const box = $('gradient-stops');
    let html = '';
    gradState.stops.forEach(function (s, i) {
      const hex = C.rgbToHex(s.color.r, s.color.g, s.color.b);
      html += '<div class="stop-row" data-i="' + i + '">' +
        '<label class="stop-swatch" style="background:' + hex + '" title="点击修改颜色">' +
        '<input type="color" class="stop-color-input" value="' + hex + '"></label>' +
        '<span class="stop-pos-label">位置</span>' +
        '<input type="number" class="stop-pos" min="0" max="100" value="' +
        C.round(s.pos) + '">%' +
        '<button class="stop-del" title="删除节点" ' +
        (gradState.stops.length <= 2 ? 'disabled' : '') + '>×</button>' +
        '</div>';
    });
    box.innerHTML = html;
    updateGradientOutput();
  }

  function updateGradientOutput() {
    const css = P.gradientCss(gradState.type, gradState.angle, gradState.stops);
    $('gradient-preview').style.background = css;
    $('gradient-css').value = css;
  }

  function bindGradient() {
    $('gradient-stops').addEventListener('input', function (e) {
      const t = e.target;
      const row = t.closest('.stop-row');
      if (!row) return;
      const i = Number(row.dataset.i);
      if (t.classList.contains('stop-color-input')) {
        const c = C.parseHex(t.value);
        if (c) gradState.stops[i].color = c;
      } else if (t.classList.contains('stop-pos')) {
        let v = parseFloat(t.value);
        if (isNaN(v)) v = 0;
        gradState.stops[i].pos = C.clamp(v, 0, 100);
      }
      updateGradientOutput();
    });

    $('gradient-stops').addEventListener('click', function (e) {
      const t = e.target;
      if (t.classList.contains('stop-del') && !t.disabled) {
        const i = Number(t.closest('.stop-row').dataset.i);
        gradState.stops.splice(i, 1);
        renderGradient();
      }
    });

    $('btn-add-stop').addEventListener('click', function () {
      if (gradState.stops.length >= 5) {
        toast('最多支持 5 个颜色节点');
        return;
      }
      gradState.stops.push({
        color: { r: cur.r, g: cur.g, b: cur.b, a: 1 },
        pos: 100
      });
      // 均分位置
      gradState.stops.forEach(function (s, i) {
        s.pos = C.round(i / (gradState.stops.length - 1) * 100);
      });
      renderGradient();
    });

    $$('.seg-btn[data-grad]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.seg-btn[data-grad]').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        gradState.type = b.dataset.grad;
        $('angle-control').style.visibility =
          gradState.type === 'linear' ? 'visible' : 'hidden';
        updateGradientOutput();
      });
    });

    $('gradient-angle').addEventListener('input', function (e) {
      let v = parseFloat(e.target.value);
      if (isNaN(v)) v = 90;
      gradState.angle = C.clamp(v, 0, 360);
      updateGradientOutput();
    });

    $('btn-copy-gradient-css').addEventListener('click', function () {
      copyText($('gradient-css').value);
    });
  }

  /* ============================================================
   * 对比度
   * ============================================================ */
  function renderContrast() {
    const fg = contrastState.fg, bg = contrastState.bg;
    $('fg-color').style.background = rgba(fg);
    $('bg-color').style.background = rgba(bg);
    $('fg-hex').textContent = C.rgbToHex(fg.r, fg.g, fg.b, fg.a);
    $('bg-hex').textContent = C.rgbToHex(bg.r, bg.g, bg.b, bg.a);

    const ratio = P.contrastRatio(fg, bg);
    $('contrast-ratio').textContent = C.round(ratio, 2) + ':1';

    const r = P.rate(ratio);
    setPass('pass-normal-aa', r.normalAA);
    setPass('pass-large-aa', r.largeAA);
    setPass('pass-normal-aaa', r.normalAAA);
    setPass('pass-large-aaa', r.largeAAA);

    const previewBg = $('cp-preview-small').parentElement;
    previewBg.style.background = rgba(bg);
    $('cp-preview-small').style.color = rgba(fg);
    $('cp-preview-large').style.color = rgba(fg);

    renderTextSuggest();
  }

  function setPass(id, pass) {
    const el = $(id);
    el.classList.toggle('pass', pass);
    el.classList.toggle('fail', !pass);
    el.querySelector('strong').textContent = pass ? 'PASS' : 'FAIL';
  }

  function renderTextSuggest() {
    const box = $('text-suggest');
    const s = P.suggestText(contrastState.bg);
    function card(item, key, label) {
      const hex = C.rgbToHex(item.color.r, item.color.g, item.color.b);
      const best = s.best === key;
      return '<button class="suggest-card' + (best ? ' best' : '') +
        '" data-hex="' + hex + '" style="background:' + hex +
        ';color:' + (key === 'white' ? '#1F2329' : '#FFF') + '">' +
        '<span class="sg-label">' + label + (best ? ' · 推荐' : '') + '</span>' +
        '<span class="sg-hex">' + hex + '</span>' +
        '<span class="sg-ratio">对比度 ' + C.round(item.ratio, 2) + ':1</span>' +
        '</button>';
    }
    box.innerHTML = card(s.black, 'black', '黑色文字') +
      card(s.white, 'white', '白色文字');
  }

  function bindContrast() {
    $('btn-pick-fg').addEventListener('click', function () {
      contrastState.fg = { r: cur.r, g: cur.g, b: cur.b, a: cur.a };
      renderContrast();
    });
    $('btn-pick-bg').addEventListener('click', function () {
      contrastState.bg = { r: cur.r, g: cur.g, b: cur.b, a: cur.a };
      renderContrast();
    });
    $('btn-swap-fgbg').addEventListener('click', function () {
      const t = contrastState.fg;
      contrastState.fg = contrastState.bg;
      contrastState.bg = t;
      renderContrast();
    });
  }

  /* ============================================================
   * 收藏 / 品牌色板
   * ============================================================ */
  function fmtTime(t) {
    const d = new Date(t);
    function p(n) { return String(n).padStart(2, '0'); }
    return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function swatchItemHtml(item, kind) {
    const hex = C.rgbToHex(item.r, item.g, item.b, item.a);
    const cm = C.rgbToCmyk(item.r, item.g, item.b);
    const selected = kind === 'fav' ? selectedFav === item.id : selectedBrandColor === item.id;
    return '<div class="swatch-item' + (selected ? ' selected' : '') +
      '" data-id="' + item.id + '" data-kind="' + kind + '">' +
      '<div class="swatch-block" style="background:' + hex + '"></div>' +
      '<div class="swatch-meta">' +
      '<strong title="' + item.name + '">' + item.name + '</strong>' +
      '<code>' + hex + '</code>' +
      '<small>CMYK ' + C.round(cm.c * 100) + '%/' + C.round(cm.m * 100) + '%/' +
      C.round(cm.y * 100) + '%/' + C.round(cm.k * 100) + '%</small>' +
      '<em>' + fmtTime(item.time) + '</em>' +
      '</div>' +
      '<div class="swatch-ops">' +
      '<button data-op="use">使用</button>' +
      '<button data-op="rename">改名</button>' +
      '<button data-op="del">删除</button>' +
      '</div></div>';
  }

  function renderFavorites() {
    const box = $('fav-grid');
    const fav = Store.getFavorites();
    if (!fav.length) {
      box.innerHTML = '<div class="empty-tip">点击右侧"收藏当前颜色"或按 Ctrl+S 保存颜色</div>';
      return;
    }
    box.innerHTML = fav.map(function (i) { return swatchItemHtml(i, 'fav'); }).join('');
  }

  function renderBrands() {
    const box = $('brand-list');
    const brands = Store.getBrands();
    if (!brands.length) {
      box.innerHTML = '<div class="empty-tip">点击"新建色板"创建品牌 / 项目色板</div>';
      selectedBrand = null;
      return;
    }
    box.innerHTML = brands.map(function (b) {
      return '<button class="brand-item' + (selectedBrand === b.id ? ' active' : '') +
        '" data-id="' + b.id + '"><span>' + b.name + '</span><em>' +
        b.colors.length + ' 色</em></button>';
    }).join('');
    if (!selectedBrand || !Store.getBrand(selectedBrand)) {
      selectedBrand = brands[0].id;
    }
  }

  function renderBrandColors() {
    const box = $('brand-color-grid');
    const b = selectedBrand ? Store.getBrand(selectedBrand) : null;
    if (!b) {
      box.innerHTML = '<div class="empty-tip">先新建或选择一个色板</div>';
      return;
    }
    if (!b.colors.length) {
      box.innerHTML = '<div class="empty-tip">点击"添加当前颜色"把颜色加入「' + b.name + '」</div>';
      return;
    }
    box.innerHTML = b.colors.map(function (i) { return swatchItemHtml(i, 'brand'); }).join('');
  }

  function bindLibrary() {
    $$('.seg-btn[data-lib]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.seg-btn[data-lib]').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        libTab = b.dataset.lib;
        $('lib-fav').hidden = libTab !== 'fav';
        $('lib-brand').hidden = libTab !== 'brand';
      });
    });

    $('btn-add-fav').addEventListener('click', function () {
      const item = Store.addFavorite(cur, customName);
      if (item) { toast('已收藏'); renderFavorites(); }
      else toast('该颜色已在收藏中');
    });

    // 收藏卡片点击 / 操作（事件委托）
    $('fav-grid').addEventListener('click', function (e) {
      const item = e.target.closest('.swatch-item');
      if (!item) return;
      const id = item.dataset.id;
      const op = e.target.closest('[data-op]');
      if (op) {
        e.stopPropagation();
        handleSwatchOp(op.dataset.op, id, 'fav', null);
        return;
      }
      selectedFav = id;
      renderFavorites();
    });

    // 品牌
    $('brand-list').addEventListener('click', function (e) {
      const b = e.target.closest('.brand-item');
      if (!b) return;
      selectedBrand = b.dataset.id;
      renderBrands();
      renderBrandColors();
    });

    $('btn-new-brand').addEventListener('click', function () {
      openPrompt('新建色板名称', '我的品牌').then(function (name) {
        if (name === null) return;
        const b = Store.createBrand(name);
        selectedBrand = b.id;
        renderBrands();
        renderBrandColors();
      });
    });

    $('btn-rename-brand').addEventListener('click', function () {
      const b = selectedBrand ? Store.getBrand(selectedBrand) : null;
      if (!b) { toast('请先选择一个色板'); return; }
      openPrompt('修改色板名称', b.name).then(function (name) {
        if (name === null) return;
        Store.renameBrand(b.id, name);
        renderBrands();
      });
    });

    $('btn-delete-brand').addEventListener('click', function () {
      const b = selectedBrand ? Store.getBrand(selectedBrand) : null;
      if (!b) { toast('请先选择一个色板'); return; }
      openConfirm('确定删除色板「' + b.name + '」及其全部颜色吗？').then(function (ok) {
        if (!ok) return;
        Store.deleteBrand(b.id);
        selectedBrand = null;
        renderBrands();
        renderBrandColors();
      });
    });

    $('btn-add-brand-color').addEventListener('click', function () {
      if (!selectedBrand) { toast('请先选择一个色板'); return; }
      const item = Store.addBrandColor(selectedBrand, cur, customName);
      if (item) { toast('已添加到色板'); renderBrands(); renderBrandColors(); }
    });

    $('brand-color-grid').addEventListener('click', function (e) {
      const item = e.target.closest('.swatch-item');
      if (!item) return;
      const id = item.dataset.id;
      const op = e.target.closest('[data-op]');
      if (op) {
        e.stopPropagation();
        handleSwatchOp(op.dataset.op, id, 'brand', selectedBrand);
        return;
      }
      selectedBrandColor = id;
      renderBrandColors();
    });
  }

  function handleSwatchOp(op, id, kind, brandId) {
    if (op === 'use') {
      let item;
      if (kind === 'fav') item = Store.getFavorites().find(function (f) { return f.id === id; });
      else item = Store.getBrand(brandId).colors.find(function (f) { return f.id === id; });
      if (item) submitColor(item);
    } else if (op === 'rename') {
      let item;
      if (kind === 'fav') item = Store.getFavorites().find(function (f) { return f.id === id; });
      else item = Store.getBrand(brandId).colors.find(function (f) { return f.id === id; });
      openPrompt('修改颜色名称', item.name).then(function (name) {
        if (name === null) return;
        if (kind === 'fav') Store.updateFavorite(id, { name: name });
        else Store.renameBrandColor(brandId, id, name);
        renderFavorites();
        renderBrandColors();
      });
    } else if (op === 'del') {
      if (kind === 'fav') {
        Store.removeFavorite(id);
        selectedFav = null;
        renderFavorites();
      } else {
        Store.removeBrandColor(brandId, id);
        selectedBrandColor = null;
        renderBrands();
        renderBrandColors();
      }
    }
  }

  /* ============================================================
   * 历史记录
   * ============================================================ */
  function renderHistory() {
    const box = $('history-track');
    const hist = Store.getHistory();
    if (!hist.length) {
      box.innerHTML = '<span class="history-empty">使用颜色后将自动记录在此</span>';
      return;
    }
    box.innerHTML = hist.map(function (h) {
      const hex = C.rgbToHex(h.r, h.g, h.b, h.a);
      const name = C.nameColor(h.r, h.g, h.b);
      const title = name + ' · ' + hex + ' · rgb(' + Math.round(h.r) + ',' +
        Math.round(h.g) + ',' + Math.round(h.b) + ') · 点击恢复';
      return '<button class="history-item" data-id="' + h.id + '" data-hex="' +
        hex + '" title="' + title + '" style="background:' + rgba(h) +
        '"><span class="hist-del" data-id="' + h.id + '" title="删除">×</span></button>';
    }).join('');
  }

  function bindHistory() {
    $('history-track').addEventListener('click', function (e) {
      const del = e.target.closest('.hist-del');
      if (del) {
        e.stopPropagation();
        Store.removeHistory(del.dataset.id);
        renderHistory();
        return;
      }
      const item = e.target.closest('.history-item');
      if (item) {
        const c = C.parseHex(item.dataset.hex);
        if (c) submitColor(c);
      }
    });

    $('btn-clear-history').addEventListener('click', function () {
      Store.clearHistory();
      renderHistory();
      toast('历史记录已清空');
    });
  }

  /* ============================================================
   * 屏幕吸色
   * ============================================================ */
  function bindScreenPicker() {
    $('btn-screen-picker').addEventListener('click', function () {
      if (!Picker.supportsEyeDropper()) {
        toast('当前浏览器不支持屏幕吸色，请使用图片吸色功能');
        return;
      }
      Picker.pickScreen().then(function (c) {
        if (c) submitColor(c);
      });
    });
  }

  /* ============================================================
   * 顶部按钮：收藏星标 / 反转 / 随机 / 复制
   * ============================================================ */
  function bindQuickOps() {
    $('btn-favorite-star').addEventListener('click', function () {
      if (Store.isFavorite(cur)) {
        Store.removeFavoriteByColor(cur);
        toast('已取消收藏');
      } else {
        Store.addFavorite(cur, customName);
        toast('已收藏');
      }
      updateFavStar();
      renderFavorites();
    });

    $('btn-invert').addEventListener('click', function () {
      submitColor({ r: 255 - cur.r, g: 255 - cur.g, b: 255 - cur.b, a: cur.a });
    });

    $('btn-random').addEventListener('click', function () {
      submitColor(P.randomPleasant());
    });

    $('btn-copy-hex').addEventListener('click', function () {
      copyText(C.rgbToHex(cur.r, cur.g, cur.b, cur.a));
    });

    // 右侧数值列表每行的复制按钮（事件委托）
    $('value-list').addEventListener('click', function (e) {
      const btn = e.target.closest('[data-copy]');
      if (!btn) return;
      const i = parseInt(btn.dataset.copy, 10);
      const row = VALUE_ROWS[i];
      if (row) copyText(row[1]());
    });

    $('btn-copy-css-vars').addEventListener('click', function () {
      copyText(P.cssVariables(cur));
    });

    $('btn-copy-tailwind2').addEventListener('click', function () {
      copyText(P.tailwindConfig(cur));
    });

    $('btn-copy-tailwind').addEventListener('click', function () {
      copyText(P.tailwindConfig(cur));
    });

    // 图片方案保存
    $('btn-save-image-scheme').addEventListener('click', function () {
      if (!imageData.picked.length) { toast('请先在图片上吸取颜色'); return; }
      openPrompt('保存为色板名称', '图片配色方案').then(function (name) {
        if (name === null) return;
        const b = Store.createBrand(name);
        imageData.picked.slice().reverse().forEach(function (c) {
          Store.addBrandColor(b.id, c);
        });
        selectedBrand = b.id;
        renderBrands();
        renderBrandColors();
        toast('图片配色方案已保存');
      });
    });

    // 分析 TOP 切换
    $$('.seg-btn[data-analysis]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.seg-btn[data-analysis]').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        analysisN = Number(b.dataset.analysis);
        renderAnalysis();
      });
    });

    // 配色面板内的通用点击委托
    $('scheme-grid').addEventListener('click', function (e) {
      const colorBtn = e.target.closest('.scheme-color');
      if (colorBtn) {
        const c = C.parseHex(colorBtn.dataset.hex);
        if (c) submitColor(c);
        return;
      }
      const op = e.target.closest('.mini-op');
      if (op) {
        const card = op.closest('.scheme-card');
        const key = card.dataset.scheme;
        const colors = P.fromColor(cur)[key];
        if (op.dataset.op === 'copy') {
          copyText(colors.map(function (c) {
            return C.rgbToHex(c.r, c.g, c.b);
          }).join('\n'));
        } else {
          colors.forEach(function (c) { Store.addFavorite(c); });
          toast('整组已加入收藏');
          renderFavorites();
          updateFavStar();
        }
      }
    });

    $('shade-row').addEventListener('click', function (e) {
      const b = e.target.closest('.shade');
      if (!b) return;
      const c = C.parseHex(b.dataset.hex);
      if (c) submitColor(c);
    });

    // 分析列表点击
    $('analysis-list').addEventListener('click', function (e) {
      const row = e.target.closest('.analysis-row[data-hex]');
      if (!row) return;
      const c = C.parseHex(row.dataset.hex);
      if (c) submitColor(c);
    });

    // 本图吸取块点击
    $('image-picked-list').addEventListener('click', function (e) {
      const del = e.target.closest('.mini-del');
      if (del) {
        e.stopPropagation();
        imageData.picked = imageData.picked.filter(function (c) {
          return c.id !== del.dataset.id;
        });
        renderImagePicked();
        return;
      }
      const b = e.target.closest('.mini-swatch');
      if (b) {
        const c = C.parseHex(b.dataset.hex);
        if (c) submitColor(c);
      }
    });

    // 文字建议点击
    $('text-suggest').addEventListener('click', function (e) {
      const b = e.target.closest('.suggest-card');
      if (!b) return;
      const c = C.parseHex(b.dataset.hex);
      if (c) submitColor(c);
    });
  }

  /* ============================================================
   * 面板切换
   * ============================================================ */
  function switchPanel(name) {
    $$('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.panel === name);
    });
    $$('.panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + name);
    });
    if (name === 'gradient') renderGradient();
  }

  function bindNav() {
    $$('.nav-item').forEach(function (b) {
      b.addEventListener('click', function () { switchPanel(b.dataset.panel); });
    });

    $('btn-toggle-info').addEventListener('click', function () {
      $('infopanel').classList.toggle('force-show');
    });
  }

  /* ============================================================
   * 主题
   * ============================================================ */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  }

  function bindTheme() {
    $('theme-toggle').addEventListener('click', function () {
      const cur2 = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(cur2);
      Store.setSettings({ theme: cur2 });
      syncSettingsControls();
    });
  }

  /* ============================================================
   * 设置模态 / Prompt / Confirm
   * ============================================================ */
  function openSettings() {
    syncSettingsControls();
    $('modal-prompt-box').hidden = true;
    $('modal-settings-box').hidden = false;
    $('modal-overlay').hidden = false;
  }

  function closeModal() {
    $('modal-overlay').hidden = true;
    $('modal-settings-box').hidden = false;
    $('modal-prompt-box').hidden = true;
  }

  function syncSettingsControls() {
    const s = Store.getSettings();
    $('set-history-limit').value = String(s.historyLimit);
    $('set-print-notice').checked = !!s.printNotice;
    $('set-theme').value = s.theme;
  }

  function bindSettings() {
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-close-modal').addEventListener('click', closeModal);
    $('btn-done-modal').addEventListener('click', closeModal);

    $('modal-overlay').addEventListener('click', function (e) {
      if (e.target === $('modal-overlay')) closeModal();
    });

    $('set-history-limit').addEventListener('change', function (e) {
      Store.setSettings({ historyLimit: Number(e.target.value) });
      renderHistory();
    });
    $('set-print-notice').addEventListener('change', function (e) {
      Store.setSettings({ printNotice: e.target.checked });
      updateChannels();
    });
    $('set-theme').addEventListener('change', function (e) {
      applyTheme(e.target.value);
      Store.setSettings({ theme: e.target.value });
    });

    $('btn-export-backup').addEventListener('click', function () {
      global.Exporter.export('backup');
    });

    $('btn-import-backup').addEventListener('click', function () {
      $('input-backup-file').click();
    });

    $('input-backup-file').addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        const r = Store.importAll(String(reader.result));
        if (r.ok) {
          toast('数据导入成功，正在刷新');
          setTimeout(function () { global.location.reload(); }, 600);
        } else {
          toast(r.error || '导入失败');
        }
      };
      reader.onerror = function () { toast('文件读取失败'); };
      reader.readAsText(f);
      e.target.value = '';
    });

    $('btn-clear-all-data').addEventListener('click', function () {
      openConfirm('确定清空全部本地数据（当前颜色、历史、收藏、品牌色板、设置）吗？此操作不可恢复。')
        .then(function (ok) {
          if (!ok) return;
          Store.clearAll();
          toast('已清空，正在刷新');
          setTimeout(function () { global.location.reload(); }, 600);
        });
    });
  }

  let promptResolver = null;

  function openPrompt(title, def) {
    $('prompt-title').textContent = title;
    const input = $('prompt-input');
    input.type = 'text';
    input.value = def || '';
    $('modal-settings-box').hidden = true;
    $('modal-prompt-box').hidden = false;
    $('modal-overlay').hidden = false;
    setTimeout(function () { input.focus(); input.select(); }, 30);
    return new Promise(function (resolve) { promptResolver = resolve; });
  }

  function openConfirm(title) {
    $('prompt-title').textContent = title;
    const input = $('prompt-input');
    input.type = 'hidden';
    input.value = '';
    $('modal-settings-box').hidden = true;
    $('modal-prompt-box').hidden = false;
    $('modal-overlay').hidden = false;
    $('prompt-ok').focus();
    return new Promise(function (resolve) { promptResolver = resolve; });
  }

  function bindPrompt() {
    function resolveWith(v) {
      if (promptResolver) {
        const r = promptResolver;
        promptResolver = null;
        r(v);
      }
    }
    $('prompt-ok').addEventListener('click', function () {
      const v = $('prompt-input').type === 'hidden' ? true : $('prompt-input').value.trim();
      closeModal();
      resolveWith(v === '' ? null : v);
    });
    $('prompt-cancel').addEventListener('click', function () {
      closeModal();
      resolveWith($('prompt-input').type === 'hidden' ? false : null);
    });
    $('prompt-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('prompt-ok').click();
      if (e.key === 'Escape') $('prompt-cancel').click();
    });
  }

  /* ============================================================
   * 导出下拉
   * ============================================================ */
  function bindExportMenu() {
    const btn = $('btn-export');
    const menu = $('export-menu');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target)) menu.classList.remove('open');
    });
    menu.addEventListener('click', function (e) {
      const b = e.target.closest('[data-export]');
      if (!b) return;
      menu.classList.remove('open');
      global.Exporter.export(b.dataset.export);
    });
  }

  /* ============================================================
   * 快捷键
   * ============================================================ */
  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
      el.isContentEditable;
  }

  function bindShortcuts() {
    document.addEventListener('keydown', function (e) {
      // Esc 关闭弹窗 / 菜单
      if (e.key === 'Escape') {
        $('export-menu').classList.remove('open');
        if (!$('modal-overlay').hidden) { $('prompt-cancel').click(); }
        return;
      }

      const mod = e.ctrlKey || e.metaKey;

      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }

      if (isEditable(e.target)) return;

      if (mod && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(function (t) {
            const p = C.parse(t);
            if (p) submitColor(p);
            else toast('剪贴板中未识别到颜色');
          }).catch(function () { toast('无法读取剪贴板'); });
        } else {
          toast('请直接粘贴到颜色输入框');
        }
        return;
      }

      if (mod && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copyText(C.rgbToHex(cur.r, cur.g, cur.b, cur.a));
        return;
      }

      if (mod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        const item = Store.addFavorite(cur, customName);
        if (item) { toast('已保存到收藏'); renderFavorites(); }
        else toast('该颜色已在收藏中');
        updateFavStar();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (libTab === 'fav' && selectedFav) {
          Store.removeFavorite(selectedFav);
          selectedFav = null;
          renderFavorites();
        } else if (libTab === 'brand' && selectedBrandColor && selectedBrand) {
          Store.removeBrandColor(selectedBrand, selectedBrandColor);
          selectedBrandColor = null;
          renderBrands();
          renderBrandColors();
        } else {
          toast('请先在色板库中选择要删除的颜色');
        }
      }
    });
  }

  /* ============================================================
   * 初始化
   * ============================================================ */
  function init() {
    global.Store.init();
    const d = global.Store.getData();
    settings = d.settings;

    cur = {
      r: d.current.r, g: d.current.g, b: d.current.b,
      a: d.current.a === undefined ? 1 : d.current.a
    };
    customName = d.current.name || '';

    contrastState.fg = { r: cur.r, g: cur.g, b: cur.b, a: cur.a };
    contrastState.bg = { r: 255, g: 255, b: 255, a: 1 };

    applyTheme(settings.theme);
    initGradient();

    // 事件绑定
    bindSV();
    bindColorInput();
    bindImageIO();
    bindImagePicker();
    bindGradient();
    bindContrast();
    bindLibrary();
    bindHistory();
    bindScreenPicker();
    bindQuickOps();
    bindNav();
    bindTheme();
    bindSettings();
    bindPrompt();
    bindExportMenu();
    bindShortcuts();

    // 通道输入统一委托
    document.addEventListener('pointerdown', function (e) {
      if (e.target.matches && e.target.matches('.ch-range')) beginChange();
    });
    document.addEventListener('input', function (e) {
      const t = e.target;
      if (t.matches && t.matches('.ch-range, .ch-number')) {
        const row = t.closest('.channel-row');
        const other = t.classList.contains('ch-range')
          ? row.querySelector('.ch-number')
          : row.querySelector('.ch-range');
        if (other && other !== document.activeElement) other.value = t.value;
        handleGroup(t.closest('.channel-card'));
      }
    });
    document.addEventListener('change', function (e) {
      const t = e.target;
      if (t.matches && t.matches('.ch-range, .ch-number')) endChange();
    });

    // 首次渲染
    refresh(false);
    renderHistory();
    renderFavorites();
    renderBrands();
    renderBrandColors();
    renderContrast();
    renderGradient();

    // 窗口尺寸变化时重排图片画布
    let resizeTimer = null;
    global.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (imageData.img && !$('image-workspace').hidden) {
          setupImageCanvas();
        }
      }, 200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.ColorStudioApp = { undo: undo, redo: redo };
})(typeof window !== 'undefined' ? window : this);
