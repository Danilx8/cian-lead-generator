import crypto from 'crypto';
import { createCanvas } from 'canvas';
import fs from 'fs/promises';
import path from 'path';

interface AvatarOptions {
  size?: number;
  gridSize?: number;
  backgroundColor?: string;
  padding?: number;
}

export class AvatarGenerator {
  private size: number;
  private gridSize: number;
  private backgroundColor: string;
  private padding: number;

  constructor(options: AvatarOptions = {}) {
    this.size = options.size || 128;
    this.gridSize = options.gridSize || 5;
    const allowedBgColors = ['#090909', '#202020'];
    if (options.backgroundColor && !allowedBgColors.includes(options.backgroundColor.toUpperCase())) {
      // eslint-disable-next-line no-console
      console.warn(`AvatarGenerator: background color ${options.backgroundColor} is not recommended.`);
    }
    this.backgroundColor = options.backgroundColor || '#202020';
    this.padding = options.padding !== undefined ? options.padding : Math.floor(this.size * 0.125);
  }

  generateBuffer(seed: string, options: { foregroundColor?: string; backgroundColor?: string } = {}) {
    if (!seed || typeof seed !== 'string') throw new Error('Seed must be non-empty string');
    const hash = this.hash(seed);
    const pattern = this.extractPattern(hash);
    const foregroundColor = options.foregroundColor || this.extractColor(hash);
    const backgroundColor = options.backgroundColor || this.extractBackgroundColor(hash);
    const canvas = createCanvas(this.size, this.size);
    const ctx = canvas.getContext('2d');
    this.draw(ctx, pattern, foregroundColor, backgroundColor);
    return canvas.toBuffer('image/png');
  }

  async generateToFile(seed: string, outDir: string): Promise<string> {
    const buf = this.generateBuffer(seed);
    await fs.mkdir(outDir, { recursive: true });
    const filename = `${Date.now()}-${this.hash(seed).slice(0, 8)}.png`;
    const filePath = path.join(outDir, filename);
    await fs.writeFile(filePath, buf);
    return filename; // возвращаем только имя
  }

  private hash(input: string) { return crypto.createHash('md5').update(input).digest('hex'); }

  private extractPattern(hash: string) {
    const bytes = Buffer.from(hash, 'hex');
    const halfWidth = Math.ceil(this.gridSize / 2);
    const pattern: boolean[] = [];
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < halfWidth; x++) {
        const index = y * halfWidth + x;
        const byteIndex = index % bytes.length;
        const bitIndex = index % 8;
        const bit = (bytes[byteIndex] >> bitIndex) & 1;
        pattern.push(bit === 1);
      }
    }
    return this.makeSym(pattern);
  }

  private makeSym(half: boolean[]) {
    const full: boolean[][] = [];
    const halfWidth = Math.ceil(this.gridSize / 2);
    for (let y = 0; y < this.gridSize; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < this.gridSize; x++) {
        let srcX = x;
        if (x >= halfWidth) srcX = this.gridSize - 1 - x;
        const idx = y * halfWidth + srcX;
        row.push(idx < half.length ? half[idx] : false);
      }
      full.push(row);
    }
    return full;
  }

  private extractColor(hash: string) {
    const colors = ['#CCFF00', '#0CC6FF', '#FFFFFF'];
    const colorIndex = parseInt(hash.substring(0, 2), 16) % colors.length;
    return colors[colorIndex];
  }

  private extractBackgroundColor(hash: string) {
    const bgColors = ['#090909', '#202020'];
    const bgIndex = parseInt(hash.substring(2, 4), 16) % bgColors.length;
    return bgColors[bgIndex];
  }

  private parseColor(color: string) {
    const hex = color.startsWith('#') ? color.slice(1) : '000000';
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16)
    };
  }

  private draw(ctx: any, pattern: boolean[][], fg: string, bg: string) {
    const imageData = ctx.createImageData(this.size, this.size);
    const data = imageData.data;
    const bgColor = this.parseColor(bg || this.backgroundColor);
    const fgColor = this.parseColor(fg);
    const contentSize = this.size - this.padding * 2;
    const cellSize = contentSize / this.gridSize;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const inContent = x >= this.padding && x < this.size - this.padding && y >= this.padding && y < this.size - this.padding;
        let usePattern = false;
        if (inContent) {
          const contentX = x - this.padding;
          const contentY = y - this.padding;
          const gridX = Math.floor(contentX / cellSize);
          const gridY = Math.floor(contentY / cellSize);
          usePattern = !!(pattern[gridY] && pattern[gridY][gridX]);
        }
        const c = usePattern ? fgColor : bgColor;
        const idx = (y * this.size + x) * 4;
        data[idx] = c.r; data[idx + 1] = c.g; data[idx + 2] = c.b; data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }
}

export class AvatarService {
  private static generator = new AvatarGenerator();
  private static outputDir = path.join(process.cwd(), 'storage', 'pictures', 'avatars');

  static async generateAndStore(username: string | number): Promise<string> {
    const seed = String(username);
    const filename = await this.generator.generateToFile(seed, this.outputDir);
    return path.posix.join('images', 'avatars', filename).replace(/\\/g, '/');
  }
}

export default AvatarService;