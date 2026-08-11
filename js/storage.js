/**
 * ============================================================
 * storage.js —— 本地持久化存储模块
 * 统一封装 LocalStorage 的读写逻辑，供 history.js / palette.js /
 * app.js（主题设置）等模块复用，避免各处重复编写
 * try/catch 与 JSON 序列化代码。
 * ============================================================
 */

/** 统一的存储键前缀，避免与宿主页面其它数据冲突 */
const NAMESPACE = "colorstudio-pro";

export class StorageManager {
  /**
   * @param {string} namespace 命名空间，默认使用应用级命名空间
   */
  constructor(namespace = NAMESPACE) {
    this.namespace = namespace;
    this.available = StorageManager._detectAvailability();
    if (!this.available) {
      // 内存兜底：当 LocalStorage 不可用（隐私模式 / 禁用）时，
      // 退化为内存存储，保证功能不报错，仅刷新后不持久化。
      this._memoryFallback = new Map();
      console.warn("[ColorStudio Pro] LocalStorage 不可用，已切换为内存存储模式。");
    }
  }

  /** 检测当前环境是否可用 LocalStorage */
  static _detectAvailability() {
    try {
      const testKey = "__colorstudio_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  _buildKey(key) {
    return `${this.namespace}:${key}`;
  }

  /**
   * 读取并反序列化数据。
   * @param {string} key
   * @param {*} defaultValue 解析失败或不存在时返回的默认值
   */
  get(key, defaultValue = null) {
    const fullKey = this._buildKey(key);
    try {
      if (!this.available) {
        return this._memoryFallback.has(fullKey)
          ? this._memoryFallback.get(fullKey)
          : defaultValue;
      }
      const raw = window.localStorage.getItem(fullKey);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (error) {
      console.error(`[ColorStudio Pro] 读取存储项 "${key}" 失败：`, error);
      return defaultValue;
    }
  }

  /**
   * 序列化并写入数据。
   * @param {string} key
   * @param {*} value
   * @returns {boolean} 是否写入成功
   */
  set(key, value) {
    const fullKey = this._buildKey(key);
    try {
      if (!this.available) {
        this._memoryFallback.set(fullKey, value);
        return true;
      }
      window.localStorage.setItem(fullKey, JSON.stringify(value));
      return true;
    } catch (error) {
      // 常见于超出存储配额，此时不应让功能崩溃
      console.error(`[ColorStudio Pro] 写入存储项 "${key}" 失败：`, error);
      return false;
    }
  }

  /** 删除指定键 */
  remove(key) {
    const fullKey = this._buildKey(key);
    try {
      if (!this.available) {
        this._memoryFallback.delete(fullKey);
        return;
      }
      window.localStorage.removeItem(fullKey);
    } catch (error) {
      console.error(`[ColorStudio Pro] 删除存储项 "${key}" 失败：`, error);
    }
  }
}

/** 全局共享的存储管理器单例 */
export const storage = new StorageManager();

/** 各功能模块统一使用的存储键常量，集中管理防止拼写不一致 */
export const STORAGE_KEYS = {
  HISTORY: "history",
  FAVORITES: "favorites",
  THEME: "theme-mode",
  LAST_COLOR: "last-color",
};
