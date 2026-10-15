/* ============================================================
 * ColorStudio Pro - storage.js
 * 本地数据层：LocalStorage
 * 保存：当前颜色 / 历史 / 收藏 / 品牌色板 / 设置
 * ============================================================ */
(function (global) {
  'use strict';

  const Store = {};
  const KEY = 'colorstudio_pro_data_v1';

  Store.usable = false;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  Store.uid = uid;

  function defaults() {
    return {
      version: 1,
      settings: {
        historyLimit: 50,
        printNotice: true,
        theme: 'light'
      },
      current: { r: 22, g: 119, b: 255, a: 1, name: '' },
      history: [],
      favorites: [],
      brands: []
    };
  }

  let data = defaults();

  /* ---------- 可用性检测 ---------- */
  function detect() {
    const t = '__csp_test__';
    try {
      global.localStorage.setItem(t, '1');
      global.localStorage.removeItem(t);
      Store.usable = true;
    } catch (e) {
      Store.usable = false;
    }
    return Store.usable;
  }

  function persist() {
    if (!Store.usable) return false;
    try {
      global.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      // 配额已满等情况：静默失败，数据仍保留在内存
      return false;
    }
  }

  // 合并旧数据时做字段保护
  function merge(saved) {
    const d = defaults();
    if (!saved || typeof saved !== 'object') return d;
    try {
      d.settings = Object.assign(d.settings, saved.settings || {});
      d.current = Object.assign(d.current, saved.current || {});
      d.history = Array.isArray(saved.history) ? saved.history : [];
      d.favorites = Array.isArray(saved.favorites) ? saved.favorites : [];
      d.brands = Array.isArray(saved.brands) ? saved.brands : [];
      // 范围修正
      d.settings.historyLimit = [30, 50, 100].indexOf(Number(d.settings.historyLimit)) !== -1
        ? Number(d.settings.historyLimit) : 50;
      ['current'].forEach(function () {
        d.current.r = Number(d.current.r); d.current.g = Number(d.current.g);
        d.current.b = Number(d.current.b);
        d.current.a = d.current.a === undefined ? 1 : Number(d.current.a);
        if (isNaN(d.current.r) || isNaN(d.current.g) || isNaN(d.current.b)) {
          d.current = defaults().current;
        }
      });
    } catch (e) {
      return defaults();
    }
    return d;
  }

  Store.init = function () {
    detect();
    if (Store.usable) {
      try {
        const raw = global.localStorage.getItem(KEY);
        if (raw) data = merge(JSON.parse(raw));
      } catch (e) {
        data = defaults();
      }
    }
    return data;
  };

  Store.getData = function () { return data; };

  /* ---------- 设置 ---------- */
  Store.getSettings = function () { return data.settings; };
  Store.setSettings = function (patch) {
    data.settings = Object.assign(data.settings, patch || {});
    persist();
    return data.settings;
  };

  /* ---------- 当前颜色 ---------- */
  Store.getCurrent = function () { return data.current; };
  Store.setCurrent = function (color, name) {
    data.current = {
      r: color.r, g: color.g, b: color.b,
      a: color.a === undefined ? 1 : color.a,
      name: name === undefined ? (data.current.name || '') : name
    };
    persist();
    return data.current;
  };
  Store.setCurrentName = function (name) {
    data.current.name = name || '';
    persist();
  };

  /* ---------- 历史记录 ---------- */
  Store.getHistory = function () { return data.history; };

  Store.addHistory = function (color) {
    const C = global.ColorMath;
    const hex = C.rgbToHex(color.r, color.g, color.b);
    // 去重：已存在则移到最前
    data.history = data.history.filter(function (h) {
      return C.rgbToHex(h.r, h.g, h.b) !== hex;
    });
    data.history.unshift({
      id: uid(),
      r: color.r, g: color.g, b: color.b,
      a: color.a === undefined ? 1 : color.a,
      time: Date.now()
    });
    const limit = data.settings.historyLimit;
    if (data.history.length > limit) data.history = data.history.slice(0, limit);
    persist();
    return data.history;
  };

  Store.removeHistory = function (id) {
    data.history = data.history.filter(function (h) { return h.id !== id; });
    persist();
  };

  Store.clearHistory = function () {
    data.history = [];
    persist();
  };

  /* ---------- 收藏 ---------- */
  Store.getFavorites = function () { return data.favorites; };

  Store.isFavorite = function (color) {
    const C = global.ColorMath;
    const hex = C.rgbToHex(color.r, color.g, color.b);
    return data.favorites.some(function (f) {
      return C.rgbToHex(f.r, f.g, f.b) === hex;
    });
  };

  Store.addFavorite = function (color, name) {
    const C = global.ColorMath;
    if (Store.isFavorite(color)) return null;
    const auto = C.nameColor(color.r, color.g, color.b);
    const item = {
      id: uid(),
      name: name && name.trim() ? name.trim() : auto,
      r: color.r, g: color.g, b: color.b,
      a: color.a === undefined ? 1 : color.a,
      time: Date.now()
    };
    data.favorites.unshift(item);
    persist();
    return item;
  };

  Store.updateFavorite = function (id, patch) {
    const item = data.favorites.find(function (f) { return f.id === id; });
    if (!item) return null;
    if (patch.name !== undefined) item.name = patch.name;
    persist();
    return item;
  };

  Store.removeFavorite = function (id) {
    data.favorites = data.favorites.filter(function (f) { return f.id !== id; });
    persist();
  };

  Store.removeFavoriteByColor = function (color) {
    const C = global.ColorMath;
    const hex = C.rgbToHex(color.r, color.g, color.b);
    data.favorites = data.favorites.filter(function (f) {
      return C.rgbToHex(f.r, f.g, f.b) !== hex;
    });
    persist();
  };

  /* ---------- 品牌色板 ---------- */
  Store.getBrands = function () { return data.brands; };

  Store.getBrand = function (id) {
    return data.brands.find(function (b) { return b.id === id; }) || null;
  };

  Store.createBrand = function (name) {
    const item = { id: uid(), name: name && name.trim() ? name.trim() : '未命名色板', colors: [], time: Date.now() };
    data.brands.push(item);
    persist();
    return item;
  };

  Store.renameBrand = function (id, name) {
    const b = Store.getBrand(id);
    if (!b) return null;
    b.name = name && name.trim() ? name.trim() : b.name;
    persist();
    return b;
  };

  Store.deleteBrand = function (id) {
    data.brands = data.brands.filter(function (b) { return b.id !== id; });
    persist();
  };

  Store.addBrandColor = function (brandId, color, name) {
    const b = Store.getBrand(brandId);
    if (!b) return null;
    const C = global.ColorMath;
    const item = {
      id: uid(),
      name: name && name.trim() ? name.trim() : C.nameColor(color.r, color.g, color.b),
      r: color.r, g: color.g, b: color.b,
      a: color.a === undefined ? 1 : color.a,
      time: Date.now()
    };
    b.colors.unshift(item);
    persist();
    return item;
  };

  Store.renameBrandColor = function (brandId, colorId, name) {
    const b = Store.getBrand(brandId);
    if (!b) return null;
    const c = b.colors.find(function (x) { return x.id === colorId; });
    if (!c) return null;
    c.name = name && name.trim() ? name.trim() : c.name;
    persist();
    return c;
  };

  Store.removeBrandColor = function (brandId, colorId) {
    const b = Store.getBrand(brandId);
    if (!b) return;
    b.colors = b.colors.filter(function (x) { return x.id !== colorId; });
    persist();
  };

  /* ---------- 全部数据 导出 / 导入 ---------- */
  Store.exportAll = function () {
    return JSON.stringify(data, null, 2);
  };

  // 返回 {ok, error}
  Store.importAll = function (text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'JSON 格式错误，无法解析' };
    }
    if (!parsed || typeof parsed !== 'object' || parsed.version === undefined) {
      return { ok: false, error: '文件不是 ColorStudio Pro 的数据备份' };
    }
    const merged = merge(parsed);
    data = merged;
    persist();
    return { ok: true };
  };

  Store.clearAll = function () {
    data = defaults();
    if (Store.usable) {
      try { global.localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
    }
  };

  global.Store = Store;
})(typeof window !== 'undefined' ? window : this);
