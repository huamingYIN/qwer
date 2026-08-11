/**
 * ============================================================
 * history.js —— 历史记录模块
 * 负责维护“最近使用颜色”列表：新增去重、容量上限、
 * 持久化到 LocalStorage，并对外提供订阅通知机制，
 * 便于 app.js 在数据变化时刷新界面。
 * ============================================================
 */

import { storage, STORAGE_KEYS } from "./storage.js";
import { generateId } from "./utils.js";

/** 历史记录最大容量，超出后自动淘汰最旧的记录 */
const MAX_HISTORY_SIZE = 24;

export class HistoryManager {
  constructor() {
    /** @type {Array<{id:string, hex:string, a:number, createdAt:number}>} */
    this.items = storage.get(STORAGE_KEYS.HISTORY, []);
    /** @type {Set<Function>} 数据变化订阅者集合 */
    this._listeners = new Set();
  }

  /**
   * 订阅历史记录变化。
   * @param {Function} listener 回调函数，接收最新的 items 数组
   * @returns {Function} 取消订阅函数
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify() {
    this._listeners.forEach((listener) => listener(this.items));
  }

  _persist() {
    storage.set(STORAGE_KEYS.HISTORY, this.items);
  }

  /**
   * 新增一条历史记录。若该颜色（含透明度）已存在，
   * 则将其移动到最前面而不是产生重复项。
   * @param {string} hex 不含 Alpha 的 6 位 HEX
   * @param {number} alpha 0-1
   */
  add(hex, alpha = 1) {
    const normalizedHex = hex.toUpperCase();
    const existingIndex = this.items.findIndex(
      (item) => item.hex === normalizedHex && Math.abs(item.a - alpha) < 0.005
    );

    if (existingIndex !== -1) {
      const [existing] = this.items.splice(existingIndex, 1);
      existing.createdAt = Date.now();
      this.items.unshift(existing);
    } else {
      this.items.unshift({
        id: generateId(),
        hex: normalizedHex,
        a: alpha,
        createdAt: Date.now(),
      });
    }

    if (this.items.length > MAX_HISTORY_SIZE) {
      this.items.length = MAX_HISTORY_SIZE;
    }

    this._persist();
    this._notify();
  }

  /** 清空全部历史记录 */
  clear() {
    this.items = [];
    this._persist();
    this._notify();
  }

  /** 获取全部历史记录（只读拷贝） */
  getAll() {
    return [...this.items];
  }
}

/** 全局共享的历史记录管理器单例 */
export const historyManager = new HistoryManager();

/**
 * ============================================================
 * FavoritesManager —— 收藏颜色管理器
 * 与历史记录同源同构，但语义不同：由用户主动收藏、
 * 手动删除、并支持拖拽排序（顺序本身也会被持久化）。
 * 复用同一份持久化文件的原因：收藏与历史都是“颜色列表”，
 * 抽出独立文件反而会引入重复的增删改查样板代码。
 * ============================================================
 */
export class FavoritesManager {
  constructor() {
    /** @type {Array<{id:string, hex:string, a:number, createdAt:number}>} */
    this.items = storage.get(STORAGE_KEYS.FAVORITES, []);
    this._listeners = new Set();
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify() {
    this._listeners.forEach((listener) => listener(this.items));
  }

  _persist() {
    storage.set(STORAGE_KEYS.FAVORITES, this.items);
  }

  /** 判断某颜色是否已收藏 */
  has(hex, alpha = 1) {
    const normalizedHex = hex.toUpperCase();
    return this.items.some(
      (item) => item.hex === normalizedHex && Math.abs(item.a - alpha) < 0.005
    );
  }

  /** 新增收藏，若已存在则忽略 */
  add(hex, alpha = 1) {
    if (this.has(hex, alpha)) return false;
    this.items.push({
      id: generateId(),
      hex: hex.toUpperCase(),
      a: alpha,
      createdAt: Date.now(),
    });
    this._persist();
    this._notify();
    return true;
  }

  /** 按 id 删除收藏 */
  removeById(id) {
    this.items = this.items.filter((item) => item.id !== id);
    this._persist();
    this._notify();
  }

  /** 清空全部收藏 */
  clear() {
    this.items = [];
    this._persist();
    this._notify();
  }

  /**
   * 重新排序：将 fromIndex 位置的项移动到 toIndex，
   * 用于拖拽排序交互。
   */
  reorder(fromIndex, toIndex) {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this.items.length ||
      toIndex >= this.items.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [moved] = this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, moved);
    this._persist();
    this._notify();
  }

  getAll() {
    return [...this.items];
  }
}

/** 全局共享的收藏管理器单例 */
export const favoritesManager = new FavoritesManager();
