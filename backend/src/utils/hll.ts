import { createHash, randomUUID } from 'crypto';

const DEFAULT_P = 12; // 2^12 = 4096 registers
const DEFAULT_M = 1 << DEFAULT_P;

export class HLL {
  private readonly p: number;
  private readonly m: number;
  private readonly registers: Uint8Array;

  constructor(p = DEFAULT_P, registers?: Uint8Array) {
    this.p = p;
    this.m = 1 << p;
    this.registers = registers || new Uint8Array(this.m);
  }

  static fromBuffer(buf: Buffer, p = DEFAULT_P): HLL {
    return new HLL(p, new Uint8Array(buf));
  }

  toBuffer(): Buffer {
    return Buffer.from(this.registers);
  }

  add(value: string): void {
    const hash = hashToBigInt(value);
    const idx = Number(hash >> BigInt(64 - this.p));
    const w = (hash << BigInt(this.p)) & ((1n << 64n) - 1n);
    const rank = leadingZeros(w, 64 - this.p) + 1;
    const current = this.registers[idx] ?? 0;
    if (rank > current) {
      this.registers[idx] = rank;
    }
  }

  union(other: HLL): HLL {
    if (other.m !== this.m) {
      throw new Error('HLL precision mismatch');
    }
    for (let i = 0; i < this.m; i++) {
      const otherVal = other.registers[i] ?? 0;
      const current = this.registers[i] ?? 0;
      if (otherVal > current) {
        this.registers[i] = otherVal;
      }
    }
    return this;
  }

  count(): number {
    const m = this.m;
    let sum = 0;
    let zeros = 0;
    for (let i = 0; i < m; i++) {
      const r = this.registers[i] ?? 0;
      sum += Math.pow(2, -r);
      if (r === 0) zeros++;
    }

    const alpha = getAlpha(m);
    let estimate = alpha * m * m / sum;

    // Small range correction
    if (estimate <= (5 / 2) * m && zeros !== 0) {
      estimate = m * Math.log(m / zeros);
    }

    return Math.round(estimate);
  }
}

export function newHllId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function getAlpha(m: number): number {
  switch (m) {
    case 16:
      return 0.673;
    case 32:
      return 0.697;
    case 64:
      return 0.709;
    default:
      return 0.7213 / (1 + 1.079 / m);
  }
}

function hashToBigInt(value: string): bigint {
  const hash = createHash('sha1').update(value).digest();
  return BigInt('0x' + hash.subarray(0, 8).toString('hex'));
}

function leadingZeros(x: bigint, width: number): number {
  if (x === 0n) return width;
  let count = 0;
  for (let i = width - 1; i >= 0; i--) {
    if (((x >> BigInt(i)) & 1n) === 1n) break;
    count++;
  }
  return count;
}
