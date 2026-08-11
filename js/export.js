/**
 * ============================================================
 * export.js —— 颜色格式化与导出模块
 * 分为两部分职责：
 *   1. ColorFormatter：将单个 ColorState 格式化为各类
 *      代码片段字符串（用于“一键复制”按钮）。
 *   2. PaletteExporter：将一组颜色导出为可下载的文件
 *      （CSS / SCSS / LESS / JSON / ASE / GPL / TXT）。
 * ============================================================
 */

import { roundTo } from "./utils.js";
import { downloadFile } from "./utils.js";

/**
 * ============================================================
 * ColorFormatter —— 单色格式化为各语言 / 框架的代码片段
 * ============================================================
 */
export class ColorFormatter {
  /**
   * @param {import('./color.js').ColorState} color
   * @param {string} format
   * @returns {string}
   */
  static format(color, format) {
    const { r, g, b, a } = color;
    const { h: hslH, s: hslS, l: hslL } = color.hsl;
    const { h: hsvH, s: hsvS, v: hsvV } = color.hsv;
    const { c, m, y, k } = color.cmyk;
    const { l: labL, a: labA, b: labB } = color.lab;
    const { x, y: xy, z } = color.xyz;

    switch (format) {
      case "hex":
        return color.hex;
      case "rgba_hex":
        return color.hexWithAlpha;
      case "rgb":
        return color.toRgbString();
      case "rgba":
        return color.toRgbaString();
      case "hsl":
        return a < 1 ? color.toHslaString() : color.toHslString();
      case "hsv":
        return `hsv(${hsvH}, ${hsvS}%, ${hsvV}%)`;
      case "cmyk":
        return `cmyk(${c}%, ${m}%, ${y}%, ${k}%)`;
      case "lab":
        return `lab(${labL} ${labA} ${labB})`;
      case "xyz":
        return `XYZ(${x}, ${xy}, ${z})`;
      case "css":
        return `color: ${a < 1 ? color.toRgbaString() : color.hex};`;
      case "scss":
        return `$color: ${a < 1 ? color.toRgbaString() : color.hex};`;
      case "less":
        return `@color: ${a < 1 ? color.toRgbaString() : color.hex};`;
      case "tailwind":
        return ColorFormatter._toTailwindConfig(color);
      case "flutter":
        return ColorFormatter._toFlutterColor(color);
      case "swiftui":
        return ColorFormatter._toSwiftUIColor(color);
      case "androidxml":
        return ColorFormatter._toAndroidXml(color);
      default:
        return color.hex;
    }
  }

  /** Tailwind CSS 自定义颜色片段（用于 tailwind.config.js） */
  static _toTailwindConfig(color) {
    return `colors: {\n  custom: '${color.hex.toLowerCase()}',\n}`;
  }

  /** Flutter (Dart) Color 构造代码 */
  static _toFlutterColor(color) {
    const { r, g, b, a } = color;
    const alphaHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    const rHex = r.toString(16).padStart(2, "0").toUpperCase();
    const gHex = g.toString(16).padStart(2, "0").toUpperCase();
    const bHex = b.toString(16).padStart(2, "0").toUpperCase();
    return `Color(0x${alphaHex}${rHex}${gHex}${bHex})`;
  }

  /** SwiftUI Color 构造代码 */
  static _toSwiftUIColor(color) {
    const { r, g, b, a } = color;
    const norm = (channel) => roundTo(channel / 255, 3);
    return `Color(red: ${norm(r)}, green: ${norm(g)}, blue: ${norm(b)}, opacity: ${roundTo(
      a,
      3
    )})`;
  }

  /** Android XML 颜色资源片段 */
  static _toAndroidXml(color) {
    return `<color name="custom_color">${color.hexWithAlpha}</color>`;
  }
}

/**
 * ============================================================
 * PaletteExporter —— 调色板文件导出
 * ============================================================
 */
export class PaletteExporter {
  /**
   * 统一入口：根据类型导出并触发下载。
   * @param {string} type css|scss|less|json|ase|gpl|txt
   * @param {import('./color.js').ColorState[]} colors
   * @param {string} [paletteName]
   */
  static export(type, colors, paletteName = "colorstudio-palette") {
    switch (type) {
      case "css":
        downloadFile(`${paletteName}.css`, PaletteExporter.toCss(colors), "text/css");
        break;
      case "scss":
        downloadFile(`${paletteName}.scss`, PaletteExporter.toScss(colors), "text/x-scss");
        break;
      case "less":
        downloadFile(`${paletteName}.less`, PaletteExporter.toLess(colors), "text/x-less");
        break;
      case "json":
        downloadFile(`${paletteName}.json`, PaletteExporter.toJson(colors), "application/json");
        break;
      case "ase":
        downloadFile(
          `${paletteName}.ase`,
          PaletteExporter.toAse(colors, paletteName),
          "application/octet-stream"
        );
        break;
      case "gpl":
        downloadFile(`${paletteName}.gpl`, PaletteExporter.toGpl(colors, paletteName), "text/plain");
        break;
      case "txt":
        downloadFile(`${paletteName}.txt`, PaletteExporter.toTxt(colors), "text/plain");
        break;
      default:
        console.warn(`[ColorStudio Pro] 未知的导出类型：${type}`);
    }
  }

  static toCss(colors) {
    const lines = colors.map((color, index) => `  --color-${index + 1}: ${color.hex};`);
    return `:root {\n${lines.join("\n")}\n}\n`;
  }

  static toScss(colors) {
    return colors.map((color, index) => `$color-${index + 1}: ${color.hex};`).join("\n") + "\n";
  }

  static toLess(colors) {
    return colors.map((color, index) => `@color-${index + 1}: ${color.hex};`).join("\n") + "\n";
  }

  static toJson(colors) {
    const payload = colors.map((color, index) => ({
      name: `color-${index + 1}`,
      hex: color.hex,
      rgb: { r: color.r, g: color.g, b: color.b },
      hsl: color.hsl,
      hsv: color.hsv,
      cmyk: color.cmyk,
      lab: color.lab,
      xyz: color.xyz,
      alpha: roundTo(color.a, 3),
    }));
    return JSON.stringify(payload, null, 2);
  }

  static toTxt(colors) {
    return colors
      .map((color, index) => `color-${index + 1}: ${color.hex}  ${color.toRgbString()}`)
      .join("\n");
  }

  /**
   * 生成 GIMP 调色板（.gpl）文本格式。
   * 格式规范：首行固定 "GIMP Palette"，随后声明名称，
   * 再逐行列出 "R G B  名称"。
   */
  static toGpl(colors, paletteName) {
    const header = [`GIMP Palette`, `Name: ${paletteName}`, `Columns: ${colors.length}`, `#`];
    const body = colors.map((color, index) => {
      const r = String(color.r).padStart(3, " ");
      const g = String(color.g).padStart(3, " ");
      const b = String(color.b).padStart(3, " ");
      return `${r} ${g} ${b}\tcolor-${index + 1}`;
    });
    return [...header, ...body].join("\n") + "\n";
  }

  /**
   * 生成 Adobe Swatch Exchange（.ase）二进制文件。
   * 严格按照 ASE 文件规范手工构造字节流：
   *   - 文件头："ASEF" + 版本号(1.0) + 数据块总数
   *   - 每个色块：类型 0x0001 + 数据长度 + 名称(UTF-16BE, 以 \0 结尾)
   *     + 颜色模型 "RGB " + 三个 32 位浮点分量 + 颜色类型(2=Process)
   * @param {import('./color.js').ColorState[]} colors
   * @param {string} paletteName
   * @returns {Blob}
   */
  static toAse(colors, paletteName) {
    const blocks = [];

    colors.forEach((color, index) => {
      const name = `${paletteName}-${index + 1}`;
      blocks.push(PaletteExporter._buildAseColorBlock(name, color));
    });

    const totalBlockLength = blocks.reduce((sum, block) => sum + block.byteLength, 0);
    const buffer = new ArrayBuffer(4 + 2 + 2 + 4 + totalBlockLength);
    const view = new DataView(buffer);
    let offset = 0;

    // 文件签名 "ASEF"
    PaletteExporter._writeAsciiString(view, offset, "ASEF");
    offset += 4;

    // 版本号 1.0
    view.setUint16(offset, 1, false);
    offset += 2;
    view.setUint16(offset, 0, false);
    offset += 2;

    // 数据块总数
    view.setUint32(offset, colors.length, false);
    offset += 4;

    // 依次写入每个色块
    const byteArray = new Uint8Array(buffer);
    let byteOffset = offset;
    blocks.forEach((block) => {
      byteArray.set(new Uint8Array(block), byteOffset);
      byteOffset += block.byteLength;
    });

    return new Blob([buffer], { type: "application/octet-stream" });
  }

  /** 构造单个 ASE 颜色数据块（RGB / Process 类型） */
  static _buildAseColorBlock(name, color) {
    const nameUtf16 = PaletteExporter._toUtf16BEWithNull(name);
    // 数据长度 = 名称长度字段(2) + 名称字节 + 颜色模型(4) + RGB三个float(12) + 颜色类型(2)
    const dataLength = 2 + nameUtf16.byteLength + 4 + 12 + 2;
    const totalLength = 2 + 4 + dataLength; // 块类型(2) + 块长度(4) + 数据

    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);
    let offset = 0;

    // 块类型：0x0001 表示颜色条目
    view.setUint16(offset, 0x0001, false);
    offset += 2;

    // 数据长度
    view.setUint32(offset, dataLength, false);
    offset += 4;

    // 名称字符数（含结尾 \0），单位为 UTF-16 code unit 数
    view.setUint16(offset, nameUtf16.byteLength / 2, false);
    offset += 2;

    new Uint8Array(buffer, offset, nameUtf16.byteLength).set(new Uint8Array(nameUtf16));
    offset += nameUtf16.byteLength;

    // 颜色模型 "RGB "
    PaletteExporter._writeAsciiString(view, offset, "RGB ");
    offset += 4;

    // RGB 三个 32 位浮点分量（0-1 归一化）
    view.setFloat32(offset, color.r / 255, false);
    offset += 4;
    view.setFloat32(offset, color.g / 255, false);
    offset += 4;
    view.setFloat32(offset, color.b / 255, false);
    offset += 4;

    // 颜色类型：2 = Process（可作为独立色板色，非专色/全局色）
    view.setUint16(offset, 2, false);
    offset += 2;

    return buffer;
  }

  /** 将 ASCII 字符串写入 DataView（用于文件签名 / 颜色模型标识） */
  static _writeAsciiString(view, offset, str) {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /** 将字符串转换为大端序 UTF-16，并以 \0 结尾（ASE 名称字段要求） */
  static _toUtf16BEWithNull(str) {
    const withNull = `${str}\0`;
    const buffer = new ArrayBuffer(withNull.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < withNull.length; i += 1) {
      view.setUint16(i * 2, withNull.charCodeAt(i), false);
    }
    return buffer;
  }
}
