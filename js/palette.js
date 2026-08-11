/**
 * ============================================================
 * palette.js —— 配色方案生成模块
 * 基于 HSV 色轮数学关系，围绕“基准颜色”实时生成 9 种
 * 常见配色方案。所有算法均为自研实现，不依赖第三方库。
 * ============================================================
 */

import { ColorMath, ColorState } from "./color.js";
import { clamp, roundTo } from "./utils.js";

/** 将角度归一化到 [0, 360) 区间 */
function normalizeHue(hue) {
  return ((hue % 360) + 360) % 360;
}

/** 根据 HSV 分量快速构造一个 ColorState */
function stateFromHsv(h, s, v, a = 1) {
  return ColorState.fromHsv(normalizeHue(h), clamp(s, 0, 100), clamp(v, 0, 100), a);
}

export class PaletteGenerator {
  /**
   * 互补色：色轮上相隔 180° 的两个颜色。
   * @param {ColorState} base
   * @returns {ColorState[]}
   */
  static complementary(base) {
    const { h, s, v } = base.hsv;
    return [base.clone(), stateFromHsv(h + 180, s, v, base.a)];
  }

  /**
   * 邻近色（类似色）：基准色两侧各偏移 30° 的相邻色相，共 5 个。
   */
  static analogous(base) {
    const { h, s, v } = base.hsv;
    const offsets = [-60, -30, 0, 30, 60];
    return offsets.map((offset) => stateFromHsv(h + offset, s, v, base.a));
  }

  /**
   * 三角色：色轮上均匀相隔 120° 的三个颜色。
   */
  static triadic(base) {
    const { h, s, v } = base.hsv;
    return [0, 120, 240].map((offset) => stateFromHsv(h + offset, s, v, base.a));
  }

  /**
   * 四色（矩形配色）：两组互补色对，相隔 90°。
   */
  static tetradic(base) {
    const { h, s, v } = base.hsv;
    return [0, 90, 180, 270].map((offset) => stateFromHsv(h + offset, s, v, base.a));
  }

  /**
   * 五角色：色轮上均匀相隔 72° 的五个颜色。
   */
  static pentadic(base) {
    const { h, s, v } = base.hsv;
    return [0, 72, 144, 216, 288].map((offset) => stateFromHsv(h + offset, s, v, base.a));
  }

  /**
   * 分裂互补色：基准色 + 互补色两侧各偏移 30° 的两个颜色。
   */
  static splitComplementary(base) {
    const { h, s, v } = base.hsv;
    return [0, 150, 210].map((offset) => stateFromHsv(h + offset, s, v, base.a));
  }

  /**
   * 单色配色：保持色相不变，沿明度 / 饱和度维度生成一组渐变色阶。
   * 模拟设计工具中常见的“同色系深浅阶梯”。
   */
  static monochromatic(base) {
    const { h } = base.hsv;
    const steps = [95, 80, 65, 50, 35, 20];
    return steps.map((v) => stateFromHsv(h, base.hsv.s, v, base.a));
  }

  /**
   * 渐变：在基准色与其互补色之间，于 HSV 空间做线性插值，
   * 生成一条平滑的过渡色带（6 个节点）。
   */
  static gradient(base, steps = 6) {
    const start = base.hsv;
    const endHue = normalizeHue(start.h + 180);
    const result = [];
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      // 色相沿最短路径插值，避免跨越 0°/360° 时出现反方向跳变
      let deltaHue = endHue - start.h;
      if (deltaHue > 180) deltaHue -= 360;
      if (deltaHue < -180) deltaHue += 360;
      const h = normalizeHue(start.h + deltaHue * t);
      const s = start.s + (start.s - start.s) * t; // 饱和度保持不变
      const v = start.v - (start.v - 40) * t * 0.4; // 明度轻微渐暗，增强层次
      result.push(stateFromHsv(h, s, clamp(v, 0, 100), base.a));
    }
    return result;
  }

  /**
   * Material Design 风格配色：模拟 Material Design 色板中
   * 50 ~ 900 的 10 级色阶生成规则——明度与饱和度按固定曲线分布。
   */
  static material(base) {
    const { h, s } = base.hsv;
    // Material 色板的经验明度 / 饱和度曲线（自 50 到 900）
    const stops = [
      { tone: "50", v: 98, sMul: 0.15 },
      { tone: "100", v: 95, sMul: 0.3 },
      { tone: "200", v: 90, sMul: 0.5 },
      { tone: "300", v: 85, sMul: 0.7 },
      { tone: "400", v: 78, sMul: 0.85 },
      { tone: "500", v: 70, sMul: 1.0 },
      { tone: "600", v: 62, sMul: 1.0 },
      { tone: "700", v: 54, sMul: 1.0 },
      { tone: "800", v: 46, sMul: 1.0 },
      { tone: "900", v: 36, sMul: 1.0 },
    ];
    return stops.map((stop) => ({
      tone: stop.tone,
      color: stateFromHsv(h, clamp(s * stop.sMul, 0, 100), stop.v, base.a),
    }));
  }

  /**
   * 统一入口：根据方案名称调用对应算法。
   * @param {string} harmonyType
   * @param {ColorState} base
   * @returns {Array<ColorState|{tone:string,color:ColorState}>}
   */
  static generate(harmonyType, base) {
    switch (harmonyType) {
      case "complementary":
        return PaletteGenerator.complementary(base);
      case "analogous":
        return PaletteGenerator.analogous(base);
      case "triadic":
        return PaletteGenerator.triadic(base);
      case "tetradic":
        return PaletteGenerator.tetradic(base);
      case "pentadic":
        return PaletteGenerator.pentadic(base);
      case "splitComplementary":
        return PaletteGenerator.splitComplementary(base);
      case "monochromatic":
        return PaletteGenerator.monochromatic(base);
      case "gradient":
        return PaletteGenerator.gradient(base);
      case "material":
        return PaletteGenerator.material(base);
      default:
        return [base.clone()];
    }
  }
}

/** 方案名称到中文标签的映射，供 UI 展示 */
export const HARMONY_LABELS = {
  complementary: "互补色",
  analogous: "邻近色",
  triadic: "三角色",
  tetradic: "四色",
  pentadic: "五角色",
  splitComplementary: "分裂互补",
  monochromatic: "单色",
  gradient: "渐变",
  material: "Material 配色",
};

export { roundTo };
