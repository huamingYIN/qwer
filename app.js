/**
 * ============================================================
 * app.js —— 应用主入口
 * 负责：
 *   1. 实例化各功能模块（选色器 / 历史 / 收藏 / 配色 / 导出 / 吸管）
 *   2. 建立“单一数据源”的颜色状态与所有 UI 控件之间的双向同步
 *   3. 绑定选项卡切换、主题切换、拖拽排序等交互事件
 * ============================================================
 */

import { ColorMath, ColorState } from "./js/color.js";
import { SVPicker, HueSlider, AlphaSlider } from "./js/picker.js";
import { PaletteGenerator, HARMONY_LABELS } from "./js/palette.js";
import { historyManager, favoritesManager } from "./js/history.js";
import { storage, STORAGE_KEYS } from "./js/storage.js";
import { ColorFormatter, PaletteExporter } from "./js/export.js";
import { EyeDropperTool } from "./js/eyedropper.js";
import { qs, qsa, debounce, clamp, roundTo, copyToClipboard, showToast } from "./js/utils.js";

class ColorStudioApp {
  constructor() {
    // ------------------------------------------------------
    // 状态
    // ------------------------------------------------------
    /** @type {ColorState} 当前唯一数据源 */
    this.color = ColorState.fromHex("#3B82F6");
    /** 当前生成的配色方案结果，供“导出”面板使用 */
    this.currentPaletteColors = [this.color.clone()];
    /** 当前选中的配色方案类型 */
    this.currentHarmonyType = "complementary";
    /** 图片取色画布中已加载的图片对象 */
    this.loadedImage = null;

    this._cacheDom();
    this._initTheme();
    this._initPickers();
    this._initTabs();
    this._bindValueInputs();
    this._bindCopyButtons();
    this._bindFavoriteAndUndo();
    this._bindPaletteControls();
    this._bindHistoryAndFavoritesRendering();
    this._bindImagePicker();
    this._bindEyeDropper();
    this._bindExportControls();
    this._bindZoomControls();

    // 首次渲染
    this._applyColor(this.color, { skipInputId: null, addHistory: false });
    this._renderPalette();
    this._renderHistory(historyManager.getAll());
    this._renderFavorites(favoritesManager.getAll());
  }

  // ============================================================
  // 初始化：DOM 缓存
  // ============================================================
  _cacheDom() {
    this.dom = {
      // 预览与 HEX
      hexInput: qs("#hexInput"),
      colorPreviewCurrent: qs("#colorPreviewCurrent"),
      addFavoriteBtn: qs("#addFavoriteBtn"),
      undoColorBtn: qs("#undoColorBtn"),

      // RGB / HSL / HSV / CMYK / LAB / XYZ 输入
      rgbR: qs("#rgbR"),
      rgbG: qs("#rgbG"),
      rgbB: qs("#rgbB"),
      rgbA: qs("#rgbA"),
      hslH: qs("#hslH"),
      hslS: qs("#hslS"),
      hslL: qs("#hslL"),
      hsvH: qs("#hsvH"),
      hsvS: qs("#hsvS"),
      hsvV: qs("#hsvV"),
      cmykC: qs("#cmykC"),
      cmykM: qs("#cmykM"),
      cmykY: qs("#cmykY"),
      cmykK: qs("#cmykK"),
      labL: qs("#labL"),
      labA: qs("#labA"),
      labB: qs("#labB"),
      xyzX: qs("#xyzX"),
      xyzY: qs("#xyzY"),
      xyzZ: qs("#xyzZ"),

      // 选色器
      svCanvas: qs("#svCanvas"),
      svPicker: qs("#svPicker"),
      svCursor: qs("#svCursor"),
      hueCanvas: qs("#hueCanvas"),
      hueSlider: qs("#hueSlider"),
      hueThumb: qs("#hueThumb"),
      alphaCanvas: qs("#alphaCanvas"),
      alphaSlider: qs("#alphaSlider"),
      alphaThumb: qs("#alphaThumb"),
      zoomInBtn: qs("#zoomInBtn"),
      zoomOutBtn: qs("#zoomOutBtn"),
      zoomResetBtn: qs("#zoomResetBtn"),
      zoomLabel: qs("#zoomLabel"),

      // 主题
      themeSwitch: qs("#themeSwitch"),

      // 选项卡
      sidePanelTabs: qs("#sidePanelTabs"),
      tabContents: qsa("[data-tab-content]"),

      // 配色生成
      paletteControls: qs("#paletteControls"),
      paletteResults: qs("#paletteResults"),

      // 历史 / 收藏
      historyList: qs("#historyList"),
      favoritesList: qs("#favoritesList"),
      clearHistoryBtn: qs("#clearHistoryBtn"),
      clearFavoritesBtn: qs("#clearFavoritesBtn"),

      // 图片取色
      imageUploadInput: qs("#imageUploadInput"),
      imageCanvas: qs("#imageCanvas"),
      imagePickerPlaceholder: qs("#imagePickerPlaceholder"),
      imageLoupe: qs("#imageLoupe"),

      // 吸管
      eyedropperBtn: qs("#eyedropperBtn"),

      // 对比度检测
      contrastSampleBlack: qs("#contrastSampleBlack"),
      contrastSampleWhite: qs("#contrastSampleWhite"),
      contrastRatioBlack: qs("#contrastRatioBlack"),
      contrastRatioWhite: qs("#contrastRatioWhite"),
      contrastBestText: qs("#contrastBestText"),
      contrastAAText: qs("#contrastAAText"),
      contrastAALarge: qs("#contrastAALarge"),
      contrastAAAText: qs("#contrastAAAText"),
      contrastAAALarge: qs("#contrastAAALarge"),

      // 导出
      exportControls: qs(".export-controls"),
    };
  }

  // ============================================================
  // 主题（浅色 / 深色 / 自动）
  // ============================================================
  _initTheme() {
    const savedMode = storage.get(STORAGE_KEYS.THEME, "dark");
    this._applyThemeMode(savedMode);

    this.dom.themeSwitch.addEventListener("click", (event) => {
      const btn = event.target.closest(".theme-switch__btn");
      if (!btn) return;
      const mode = btn.dataset.themeMode;
      this._applyThemeMode(mode);
      storage.set(STORAGE_KEYS.THEME, mode);
    });

    // 跟随系统模式下，实时响应系统主题切换
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    mediaQuery.addEventListener("change", () => {
      if (storage.get(STORAGE_KEYS.THEME, "dark") === "auto") {
        this._applyThemeMode("auto");
      }
    });
  }

  _applyThemeMode(mode) {
    let resolved = mode;
    if (mode === "auto") {
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      resolved = prefersLight ? "light" : "dark";
    }
    document.documentElement.setAttribute("data-theme", resolved);

    qsa(".theme-switch__btn", this.dom.themeSwitch).forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.themeMode === mode);
    });
  }

  // ============================================================
  // 选色器初始化（SV / Hue / Alpha）
  // ============================================================
  _initPickers() {
    this.svPicker = new SVPicker({
      canvas: this.dom.svCanvas,
      cursorEl: this.dom.svCursor,
      wrapperEl: this.dom.svPicker,
      onChange: (s, v) => {
        const { h } = this.color.hsv;
        const next = ColorState.fromHsv(h, s, v, this.color.a);
        this._applyColor(next, { skipInputId: "svPicker", addHistory: false });
      },
    });

    this.hueSlider = new HueSlider({
      canvas: this.dom.hueCanvas,
      thumbEl: this.dom.hueThumb,
      onChange: (hue) => {
        const { s, v } = this.color.hsv;
        const next = ColorState.fromHsv(hue, s, v, this.color.a);
        this._applyColor(next, { skipInputId: "hueSlider", addHistory: false });
      },
    });

    this.alphaSlider = new AlphaSlider({
      canvas: this.dom.alphaCanvas,
      thumbEl: this.dom.alphaThumb,
      onChange: (alpha) => {
        const next = this.color.clone();
        next.a = clamp(alpha, 0, 1);
        this._applyColor(next, { skipInputId: "alphaSlider", addHistory: false });
      },
    });

    // 拖拽结束后，将最终颜色写入历史记录（避免拖动过程中频繁写入）
    ["pointerup", "pointercancel"].forEach((evtName) => {
      this.dom.svCanvas.addEventListener(evtName, () => this._commitToHistory());
      this.dom.hueCanvas.addEventListener(evtName, () => this._commitToHistory());
      this.dom.alphaCanvas.addEventListener(evtName, () => this._commitToHistory());
    });
  }

  _bindZoomControls() {
    let zoom = 1;
    const updateLabel = () => {
      this.dom.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    };
    this.dom.zoomInBtn.addEventListener("click", () => {
      zoom = clamp(zoom + 0.25, 0.5, 3);
      this.svPicker.setZoom(zoom);
      updateLabel();
    });
    this.dom.zoomOutBtn.addEventListener("click", () => {
      zoom = clamp(zoom - 0.25, 0.5, 3);
      this.svPicker.setZoom(zoom);
      updateLabel();
    });
    this.dom.zoomResetBtn.addEventListener("click", () => {
      zoom = 1;
      this.svPicker.setZoom(zoom);
      updateLabel();
    });
  }

  // ============================================================
  // 选项卡切换
  // ============================================================
  _initTabs() {
    this.dom.sidePanelTabs.addEventListener("click", (event) => {
      const btn = event.target.closest(".side-panel__tab");
      if (!btn) return;
      const targetTab = btn.dataset.tab;

      qsa(".side-panel__tab", this.dom.sidePanelTabs).forEach((tabBtn) => {
        const isActive = tabBtn === btn;
        tabBtn.classList.toggle("is-active", isActive);
        tabBtn.setAttribute("aria-selected", String(isActive));
      });

      this.dom.tabContents.forEach((content) => {
        const isActive = content.dataset.tabContent === targetTab;
        content.hidden = !isActive;
        content.classList.toggle("is-active", isActive);
      });
    });
  }

  // ============================================================
  // 颜色数值输入框：双向同步核心逻辑
  // ============================================================
  _bindValueInputs() {
    // HEX 输入框
    this.dom.hexInput.addEventListener(
      "input",
      debounce(() => {
        const parsed = ColorState.fromHex(this.dom.hexInput.value);
        if (parsed) {
          this._applyColor(parsed, { skipInputId: "hexInput", addHistory: false });
        }
      }, 120)
    );
    this.dom.hexInput.addEventListener("change", () => this._commitToHistory());

    // RGB(A)
    const onRgbChange = () => {
      const r = clamp(Number(this.dom.rgbR.value), 0, 255);
      const g = clamp(Number(this.dom.rgbG.value), 0, 255);
      const b = clamp(Number(this.dom.rgbB.value), 0, 255);
      const a = clamp(Number(this.dom.rgbA.value), 0, 100) / 100;
      const next = new ColorState(r, g, b, a);
      this._applyColor(next, { skipInputId: "rgb", addHistory: false });
    };
    [this.dom.rgbR, this.dom.rgbG, this.dom.rgbB, this.dom.rgbA].forEach((input) => {
      input.addEventListener("input", debounce(onRgbChange, 100));
      input.addEventListener("change", () => this._commitToHistory());
    });

    // HSL
    const onHslChange = () => {
      const h = clamp(Number(this.dom.hslH.value), 0, 360);
      const s = clamp(Number(this.dom.hslS.value), 0, 100);
      const l = clamp(Number(this.dom.hslL.value), 0, 100);
      const next = ColorState.fromHsl(h, s, l, this.color.a);
      this._applyColor(next, { skipInputId: "hsl", addHistory: false });
    };
    [this.dom.hslH, this.dom.hslS, this.dom.hslL].forEach((input) => {
      input.addEventListener("input", debounce(onHslChange, 100));
      input.addEventListener("change", () => this._commitToHistory());
    });

    // HSV
    const onHsvChange = () => {
      const h = clamp(Number(this.dom.hsvH.value), 0, 360);
      const s = clamp(Number(this.dom.hsvS.value), 0, 100);
      const v = clamp(Number(this.dom.hsvV.value), 0, 100);
      const next = ColorState.fromHsv(h, s, v, this.color.a);
      this._applyColor(next, { skipInputId: "hsv", addHistory: false });
    };
    [this.dom.hsvH, this.dom.hsvS, this.dom.hsvV].forEach((input) => {
      input.addEventListener("input", debounce(onHsvChange, 100));
      input.addEventListener("change", () => this._commitToHistory());
    });

    // CMYK
    const onCmykChange = () => {
      const c = clamp(Number(this.dom.cmykC.value), 0, 100);
      const m = clamp(Number(this.dom.cmykM.value), 0, 100);
      const y = clamp(Number(this.dom.cmykY.value), 0, 100);
      const k = clamp(Number(this.dom.cmykK.value), 0, 100);
      const next = ColorState.fromCmyk(c, m, y, k, this.color.a);
      this._applyColor(next, { skipInputId: "cmyk", addHistory: false });
    };
    [this.dom.cmykC, this.dom.cmykM, this.dom.cmykY, this.dom.cmykK].forEach((input) => {
      input.addEventListener("input", debounce(onCmykChange, 100));
      input.addEventListener("change", () => this._commitToHistory());
    });

    // LAB
    const onLabChange = () => {
      const l = clamp(Number(this.dom.labL.value), 0, 100);
      const a = clamp(Number(this.dom.labA.value), -128, 127);
      const b = clamp(Number(this.dom.labB.value), -128, 127);
      const next = ColorState.fromLab(l, a, b, this.color.a);
      this._applyColor(next, { skipInputId: "lab", addHistory: false });
    };
    [this.dom.labL, this.dom.labA, this.dom.labB].forEach((input) => {
      input.addEventListener("input", debounce(onLabChange, 100));
      input.addEventListener("change", () => this._commitToHistory());
    });

    // XYZ
    const onXyzChange = () => {
      const x = clamp(Number(this.dom.xyzX.value), 0, 100);
      const y = clamp(Number(this.dom.xyzY.value), 0, 100);
      const z = clamp(Number(this.dom.xyzZ.value), 0, 120);
      const next = ColorState.fromXyz(x, y, z, this.color.a);
      this._applyColor(next, { skipInputId: "xyz", addHistory: false });
    };
    [this.dom.xyzX, this.dom.xyzY, this.dom.xyzZ].forEach((input) => {
      input.addEventListener("input", debounce(onXyzChange, 100));
      input.addEventListener("change", () => this._commitToHistory());
    });
  }

  /**
   * 统一的颜色应用入口：更新数据源、同步全部 UI，
   * 但不会把正在编辑的输入框（skipInputId 对应分组）覆盖，
   * 避免用户输入过程中光标跳动。
   * @param {ColorState} nextColor
   * @param {{skipInputId: string|null, addHistory: boolean}} options
   */
  _applyColor(nextColor, { skipInputId = null, addHistory = false } = {}) {
    this.color = nextColor;

    // 预览区域
    this.dom.colorPreviewCurrent.style.backgroundColor = this.color.toRgbaString();

    // HEX
    if (skipInputId !== "hexInput") {
      this.dom.hexInput.value = this.color.a < 1 ? this.color.hexWithAlpha : this.color.hex;
    }

    // RGB(A)
    if (skipInputId !== "rgb") {
      this.dom.rgbR.value = this.color.r;
      this.dom.rgbG.value = this.color.g;
      this.dom.rgbB.value = this.color.b;
      this.dom.rgbA.value = Math.round(this.color.a * 100);
    }

    // HSL
    const hsl = this.color.hsl;
    if (skipInputId !== "hsl") {
      this.dom.hslH.value = hsl.h;
      this.dom.hslS.value = hsl.s;
      this.dom.hslL.value = hsl.l;
    }

    // HSV
    const hsv = this.color.hsv;
    if (skipInputId !== "hsv") {
      this.dom.hsvH.value = hsv.h;
      this.dom.hsvS.value = hsv.s;
      this.dom.hsvV.value = hsv.v;
    }

    // CMYK
    const cmyk = this.color.cmyk;
    if (skipInputId !== "cmyk") {
      this.dom.cmykC.value = cmyk.c;
      this.dom.cmykM.value = cmyk.m;
      this.dom.cmykY.value = cmyk.y;
      this.dom.cmykK.value = cmyk.k;
    }

    // LAB
    const lab = this.color.lab;
    if (skipInputId !== "lab") {
      this.dom.labL.value = lab.l;
      this.dom.labA.value = lab.a;
      this.dom.labB.value = lab.b;
    }

    // XYZ
    const xyz = this.color.xyz;
    if (skipInputId !== "xyz") {
      this.dom.xyzX.value = xyz.x;
      this.dom.xyzY.value = xyz.y;
      this.dom.xyzZ.value = xyz.z;
    }

    // 选色器同步
    if (skipInputId !== "svPicker") {
      this.svPicker.setValue(hsv.s, hsv.v);
    }
    if (skipInputId !== "hueSlider") {
      this.hueSlider.setValue(hsv.h);
    }
    this.svPicker.setHue(hsv.h);
    if (skipInputId !== "alphaSlider") {
      this.alphaSlider.setValue(this.color.a);
    }
    this.alphaSlider.setBaseColor(this.color.r, this.color.g, this.color.b);

    // 配色生成 + 对比度检测 实时联动
    this._renderPalette();
    this._updateContrastPanel();

    // 收藏按钮状态
    const isFav = favoritesManager.has(this.color.hex, this.color.a);
    this.dom.addFavoriteBtn.classList.toggle("is-active", isFav);

    if (addHistory) {
      this._commitToHistory();
    }
  }

  /** 将当前颜色写入历史记录（去抖，避免拖拽时高频写入） */
  _commitToHistory() {
    historyManager.add(this.color.hex, this.color.a);
  }

  // ============================================================
  // 复制按钮（HEX / RGB / RGBA / HSL / HSV / CMYK / LAB / XYZ / 代码片段）
  // ============================================================
  _bindCopyButtons() {
    document.body.addEventListener("click", async (event) => {
      const btn = event.target.closest(".copy-btn");
      if (!btn) return;
      const format = btn.dataset.format;
      const text = ColorFormatter.format(this.color, format);
      const success = await copyToClipboard(text);
      showToast(success ? `已复制：${text}` : "复制失败，请手动选择文本");
    });
  }

  // ============================================================
  // 收藏 / 撤销
  // ============================================================
  _bindFavoriteAndUndo() {
    this.dom.addFavoriteBtn.addEventListener("click", () => {
      const added = favoritesManager.add(this.color.hex, this.color.a);
      this.dom.addFavoriteBtn.classList.toggle("is-active", true);
      showToast(added ? "已加入收藏" : "该颜色已在收藏夹中");
    });

    this.dom.undoColorBtn.addEventListener("click", () => {
      const items = historyManager.getAll();
      // items[0] 通常是当前颜色本身，items[1] 才是“上一个”颜色
      const previous = items[1];
      if (!previous) {
        showToast("暂无更早的历史颜色");
        return;
      }
      const next = ColorState.fromHex(previous.hex);
      next.a = previous.a;
      this._applyColor(next, { addHistory: false });
      historyManager.add(next.hex, next.a);
    });
  }

  // ============================================================
  // 配色生成
  // ============================================================
  _bindPaletteControls() {
    this.dom.paletteControls.addEventListener("click", (event) => {
      const btn = event.target.closest(".btn--chip");
      if (!btn) return;
      qsa(".btn--chip", this.dom.paletteControls).forEach((chip) =>
        chip.classList.toggle("is-active", chip === btn)
      );
      this.currentHarmonyType = btn.dataset.harmony;
      this._renderPalette();
    });
  }

  _renderPalette() {
    const rawResult = PaletteGenerator.generate(this.currentHarmonyType, this.color);
    const isMaterial = this.currentHarmonyType === "material";

    this.currentPaletteColors = isMaterial
      ? rawResult.map((item) => item.color)
      : rawResult;

    this.dom.paletteResults.innerHTML = "";
    rawResult.forEach((item) => {
      const colorState = isMaterial ? item.color : item;
      const label = isMaterial ? item.tone : colorState.hex;

      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "palette-swatch";
      swatch.title = `点击应用该颜色 ${colorState.hex}`;

      const colorBlock = document.createElement("div");
      colorBlock.className = "palette-swatch__color";
      colorBlock.style.backgroundColor = colorState.toRgbaString();

      const labelEl = document.createElement("div");
      labelEl.className = "palette-swatch__label";
      labelEl.textContent = label;

      swatch.appendChild(colorBlock);
      swatch.appendChild(labelEl);

      swatch.addEventListener("click", () => {
        this._applyColor(colorState.clone(), { addHistory: true });
      });

      this.dom.paletteResults.appendChild(swatch);
    });
  }

  // ============================================================
  // 历史记录 / 收藏颜色渲染
  // ============================================================
  _bindHistoryAndFavoritesRendering() {
    historyManager.subscribe((items) => this._renderHistory(items));
    favoritesManager.subscribe((items) => this._renderFavorites(items));

    this.dom.clearHistoryBtn.addEventListener("click", () => {
      historyManager.clear();
      showToast("历史记录已清空");
    });

    this.dom.clearFavoritesBtn.addEventListener("click", () => {
      favoritesManager.clear();
      showToast("收藏颜色已清空");
    });
  }

  _renderHistory(items) {
    this.dom.historyList.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "swatch-grid__empty";
      empty.textContent = "暂无历史记录，开始选色后会自动出现在这里";
      this.dom.historyList.appendChild(empty);
      return;
    }
    items.forEach((item) => {
      const swatch = this._createSwatchGridItem(item, { removable: false });
      this.dom.historyList.appendChild(swatch);
    });
  }

  _renderFavorites(items) {
    this.dom.favoritesList.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "swatch-grid__empty";
      empty.textContent = "还没有收藏任何颜色，点击预览区的“收藏此颜色”试试";
      this.dom.favoritesList.appendChild(empty);
      return;
    }
    items.forEach((item, index) => {
      const swatch = this._createSwatchGridItem(item, { removable: true, draggableIndex: index });
      this.dom.favoritesList.appendChild(swatch);
    });
  }

  /**
   * 创建历史 / 收藏共用的色块 DOM 节点。
   * @param {{id:string, hex:string, a:number}} item
   * @param {{removable:boolean, draggableIndex?:number}} options
   */
  _createSwatchGridItem(item, { removable, draggableIndex }) {
    const el = document.createElement("div");
    el.className = "swatch-grid__item";
    const rgb = ColorMath.hexToRgb(item.hex);
    el.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${item.a})`;
    el.title = `${item.hex}  Alpha ${Math.round(item.a * 100)}%`;

    el.addEventListener("click", () => {
      const next = ColorState.fromHex(item.hex);
      next.a = item.a;
      this._applyColor(next, { addHistory: false });
      historyManager.add(next.hex, next.a);
    });

    if (removable) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "swatch-grid__remove";
      removeBtn.textContent = "×";
      removeBtn.title = "移除收藏";
      removeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        favoritesManager.removeById(item.id);
      });
      el.appendChild(removeBtn);

      // 原生拖拽排序（无需第三方库）
      el.draggable = true;
      el.addEventListener("dragstart", (event) => {
        el.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(draggableIndex));
      });
      el.addEventListener("dragend", () => el.classList.remove("is-dragging"));
      el.addEventListener("dragover", (event) => event.preventDefault());
      el.addEventListener("drop", (event) => {
        event.preventDefault();
        const fromIndex = Number(event.dataTransfer.getData("text/plain"));
        favoritesManager.reorder(fromIndex, draggableIndex);
      });
    }

    return el;
  }

  // ============================================================
  // 图片取色
  // ============================================================
  _bindImagePicker() {
    this.dom.imageUploadInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          this.loadedImage = img;
          this._drawImageToCanvas(img);
          this.dom.imagePickerPlaceholder.style.display = "none";
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

    this.dom.imageCanvas.addEventListener("click", (event) => {
      if (!this.loadedImage) return;
      const rect = this.dom.imageCanvas.getBoundingClientRect();
      const x = Math.round(
        ((event.clientX - rect.left) / rect.width) * this.dom.imageCanvas.width
      );
      const y = Math.round(
        ((event.clientY - rect.top) / rect.height) * this.dom.imageCanvas.height
      );
      const ctx = this.dom.imageCanvas.getContext("2d");
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const next = new ColorState(pixel[0], pixel[1], pixel[2], pixel[3] / 255);
      this._applyColor(next, { addHistory: true });
    });

    this.dom.imageCanvas.addEventListener("mousemove", (event) => {
      if (!this.loadedImage) return;
      const stageRect = this.dom.imageCanvas.parentElement.getBoundingClientRect();
      this.dom.imageLoupe.hidden = false;
      this.dom.imageLoupe.style.left = `${event.clientX - stageRect.left}px`;
      this.dom.imageLoupe.style.top = `${event.clientY - stageRect.top}px`;
    });

    this.dom.imageCanvas.addEventListener("mouseleave", () => {
      this.dom.imageLoupe.hidden = true;
    });
  }

  /** 将上传的图片绘制到 Canvas，保持等比缩放，并适配 Retina */
  _drawImageToCanvas(img) {
    const dpr = window.devicePixelRatio || 1;
    const maxWidth = this.dom.imageCanvas.parentElement.clientWidth || 600;
    const maxHeight = 420;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    const displayWidth = img.width * scale;
    const displayHeight = img.height * scale;

    this.dom.imageCanvas.style.width = `${displayWidth}px`;
    this.dom.imageCanvas.style.height = `${displayHeight}px`;
    this.dom.imageCanvas.width = displayWidth * dpr;
    this.dom.imageCanvas.height = displayHeight * dpr;

    const ctx = this.dom.imageCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
  }

  // ============================================================
  // 屏幕吸管（EyeDropper）
  // ============================================================
  _bindEyeDropper() {
    this.eyeDropperTool = new EyeDropperTool({
      onPick: (hex) => {
        const next = ColorState.fromHex(hex);
        if (next) {
          this._applyColor(next, { addHistory: true });
        }
      },
      onUnsupported: () => {
        // 自动切换到“图片取色”选项卡作为降级方案
        const imageTabBtn = qs('.side-panel__tab[data-tab="image"]', this.dom.sidePanelTabs);
        if (imageTabBtn) imageTabBtn.click();
      },
    });

    this.dom.eyedropperBtn.addEventListener("click", () => {
      this.eyeDropperTool.open();
    });
  }

  // ============================================================
  // 对比度检测（WCAG）
  // ============================================================
  _updateContrastPanel() {
    const bgRgb = { r: this.color.r, g: this.color.g, b: this.color.b };
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };

    const ratioBlack = ColorMath.contrastRatio(bgRgb, black);
    const ratioWhite = ColorMath.contrastRatio(bgRgb, white);

    this.dom.contrastSampleBlack.style.backgroundColor = this.color.toRgbString();
    this.dom.contrastSampleWhite.style.backgroundColor = this.color.toRgbString();
    this.dom.contrastRatioBlack.textContent = `${ratioBlack.toFixed(2)} : 1`;
    this.dom.contrastRatioWhite.textContent = `${ratioWhite.toFixed(2)} : 1`;

    const bestIsBlack = ratioBlack >= ratioWhite;
    const bestRatio = bestIsBlack ? ratioBlack : ratioWhite;
    this.dom.contrastBestText.textContent = bestIsBlack ? "黑色文字" : "白色文字";

    const setPassBadge = (el, pass) => {
      el.textContent = pass ? "通过 ✓" : "不通过 ✗";
      el.classList.toggle("pass", pass);
      el.classList.toggle("fail", !pass);
    };

    setPassBadge(this.dom.contrastAAText, bestRatio >= 4.5);
    setPassBadge(this.dom.contrastAALarge, bestRatio >= 3);
    setPassBadge(this.dom.contrastAAAText, bestRatio >= 7);
    setPassBadge(this.dom.contrastAAALarge, bestRatio >= 4.5);
  }

  // ============================================================
  // 导出
  // ============================================================
  _bindExportControls() {
    this.dom.exportControls.addEventListener("click", (event) => {
      const btn = event.target.closest(".export-btn");
      if (!btn) return;
      const type = btn.dataset.export;
      const colors =
        this.currentPaletteColors && this.currentPaletteColors.length > 0
          ? this.currentPaletteColors
          : [this.color];
      PaletteExporter.export(type, colors, "colorstudio-pro-palette");
      showToast(`已导出 ${type.toUpperCase()} 文件`);
    });
  }
}

// ============================================================
// 启动应用
// ============================================================
// type="module" 的脚本默认具有 defer 行为，执行时 DOM 已解析完成，
// 因此无需再监听 DOMContentLoaded 即可安全访问所有元素。
window.colorStudioApp = new ColorStudioApp();
