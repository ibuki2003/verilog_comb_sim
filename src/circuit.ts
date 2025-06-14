/// Combinational Logic Circuit Simulator

import type { Module, Value, Expr, Wire } from "./circuit_types";

export type Env = { [name: string]: Value };

// returns a bigint with n-bit ones
function ones(n: number): bigint {
  return (BigInt(1) << BigInt(n)) - BigInt(1);
}

function concatValues(vals: Value[]): Value {
  let accValue = 0n;   // 連結後の値（作業用）
  let accWidth = 0;    // 連結後の幅

  for (const { width, value } of vals) {
    if (width <= 0) throw new Error(`width must be > 0 (got ${ width })`);
    if (value < 0n) throw new Error(`value must be non-negative`);

    // ビット幅を超える値は無視する
    const value_ = BigInt.asUintN(width, value);

    // 既存のビット列を左にシフト → 新しいフィールドを OR
    accValue = (accValue << BigInt(width)) | value_;
    accWidth += width;
  }

  return { width: accWidth, value: accValue };
}

const WIDTH_LITERAL_REGEX = /^(\d+)'([bBhHdD])([0-9a-fA-FxX]+)$/;
const INT_LITERAL_REGEX = /^\d+$/;

export function evalExpr(expr: Expr, env: Env): Value {
  switch (expr.type) {
    case 'constant': {

      if (INT_LITERAL_REGEX.test(expr.value)) {
        // simple integer constant, e.g. "42"
        const width = Math.ceil(Math.log2(Number(expr.value) + 1));
        return { width, value: BigInt(expr.value) };
      }
      // return { width: expr.value.length, value: BigInt(expr.value) };
      const match = expr.value.match(WIDTH_LITERAL_REGEX);
      if (!match) {
        throw new Error(`Invalid constant format: ${expr.value}`);
      }
      const width = parseInt(match[1], 10);
      const base = match[2].toLowerCase();
      switch (base) {
        case 'b':
          return { width, value: BigInt.asUintN(width, BigInt('0b' + match[3])) };
        case 'h':
          return { width, value: BigInt.asUintN(width, BigInt('0x' + match[3])) };
        case 'd':
          return { width, value: BigInt.asUintN(width, BigInt(match[3])) };
        default:
          throw new Error(`Unknown base in constant: ${base}`);
      }

    }
    case 'register':
      return env[expr.name];

    case 'bin_op': {
      console.log({ expr, env });
      const { width: lb, value: l } = evalExpr(expr.left, env);
      const { value: r } = evalExpr(expr.right, env);
      switch (expr.op) {
        // accept lb != rb, but use the left width for the result
        case '+': return { width: lb, value: BigInt.asUintN(lb, l + r) };
        case '-': return { width: lb, value: BigInt.asUintN(lb, l - r) };
        case '*': return { width: lb, value: BigInt.asUintN(lb, l * r) };
        case '/': return { width: lb, value: BigInt.asUintN(lb, r === BigInt(0) ? BigInt(0) : (l / r)) };
        case '&': return { width: lb, value: l & r};
        case '|': return { width: lb, value: l | r};
        case '^': return { width: lb, value: l ^ r};

        case '<':  return { width: 1, value: BigInt.asUintN(1, l < r ? 1n : 0n) };
        case '>':  return { width: 1, value: BigInt.asUintN(1, l > r ? 1n : 0n) };
        case '<=': return { width: 1, value: BigInt.asUintN(1, l <= r ? 1n : 0n) };
        case '>=': return { width: 1, value: BigInt.asUintN(1, l >= r ? 1n : 0n) };
        case '==': return { width: 1, value: BigInt.asUintN(1, l === r ? 1n : 0n) };

        case '<<': return { width: 1, value: BigInt.asUintN(lb, l << r) };
        case '>>': return { width: 1, value: l >> r };
        case '>>>': {
          // mathematical right shift
          // NOTE: here we assume that lhs are signed while l is always positive
          // so we need to sign-extend the value
          const is_negative = !!(l >> (BigInt(lb) - BigInt(1)));
          const l_ = is_negative ? (l | (~ones(lb))) : l; // sign-extend if negative
          const shifted = BigInt.asUintN(lb, l_ >> BigInt(r));
          return { width: lb, value: shifted };
        }
        default: throw new Error(`Unknown binary operator: ${expr.op}`);
      }
    }
    case 'un_op': {
      const {width, value} = evalExpr(expr.expr, env);
      switch (expr.op) {
        case '-': return { width, value: BigInt.asUintN(width, -value) };
        case '~': return { width, value: BigInt.asUintN(width, ~value) };
        case '!':
          // logical NOT, returns 1 if value is 0, otherwise 0
          return { width: 1, value: BigInt(!value ? 1 : 0) };
        case '|':
          // bitwise OR with all bits set to 1
          return { width: 1, value: value ? BigInt(1) : BigInt(0) };
        case '&':
          // bitwise AND with all bits set to 0
          return { width: 1, value: BigInt.asUintN(width, ~value) ? BigInt(0) : BigInt(1) };
        default: throw new Error(`Unknown unary operator: ${expr.op}`);
      }
    }
    case 'cond': {
      const condition = evalExpr(expr.condition, env);
      return condition ? evalExpr(expr.trueExpr, env) : evalExpr(expr.falseExpr, env);
    }

    case 'concat':
      return concatValues(expr.exprs.map(e => evalExpr(e, env)));

    case 'repeat': {
      const val = evalExpr(expr.expr, env);
      const count = Number(evalExpr(expr.count, env).value);
      if (count <= 0) {
        throw new Error(`Repeat count must be > 0 (got ${expr.count})`);
      }
      if (val.width === 0) {
        return { width: 0, value: 0n };
      }
      return concatValues(
        Array.from({ length: count }, () => val)
      );
    }


    case 'slice': {
      const base = Math.min(expr.start, expr.end);
      const width = Math.abs(expr.start - expr.end) + 1;
      const val = evalExpr(expr.expr, env);
      if (base + width > val.width) {
        throw new Error(`Slice out of range: start=${expr.start}, end=${expr.end}, width=${val.width}`);
      }
      // Extract bits from start to end (exclusive)
      const shifted = val.value >> BigInt(expr.start);
      const masked = BigInt.asUintN(width, shifted);
      return { width, value: masked };
    }

    case 'slice_dyn': {
      console.log(expr.start);
      const base = evalExpr(expr.start, env).value;
      const width = expr.width;
      const val = evalExpr(expr.expr, env);
      if (Number(base) + width > val.width) {
        // throw new Error(`Slice out of range: start=${base}, width=${width}, value width=${val.width}`);
        console.warn(`Slice out of range: start=${base}, width=${width}, value width=${val.width}`);
      }
      // Extract bits from start to end (exclusive)
      const shifted = val.value >> base;
      const masked = BigInt.asUintN(width, shifted);
      return { width, value: masked };
    }

    case 'select': {
      const val = evalExpr(expr.expr, env);
      const idxv = evalExpr(expr.index, env);
      const idx = Number(idxv.value);
      if (idx < 0 || idx >= val.width) {
        // throw new Error(`Index out of range: index=${expr.index}, width=${val.width}`);
        console.warn(`Index out of range: index=${idx}, width=${val.width}`);
      }
      // Extract single bit at index
      const bit = (val.value >> idxv.value) & 1n;
      return { width: 1, value: bit };
    }


    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new Error(`Unknown expression type: ${(expr as any).type}`);
  }
}

export function simulateCircuit(
  module: Module,
  inputs: { [name: string]: Value },
): Env {
  const env: Env = {};
  // Initialize inputs
  for (const input of module.inputs) {
    if (!(input.name in inputs)) {
      throw new Error(`Missing input: ${input.name}`);
    }
    if (inputs[input.name].width !== input.width) {
      throw new Error(`Input width mismatch for ${input.name}: expected ${input.width}, got ${inputs[input.name].width}`);
    }
    env[input.name] = inputs[input.name];
  }

  // Evaluate registers
  // assuming module.registers are sorted topologically
  for (const wire of module.wires) {
    env[wire.name] = evalExpr(wire.value, env);
    if (wire.width !== env[wire.name].width) {
      // throw new Error(`Wire width mismatch for ${wire.name}: expected ${wire.width}, got ${env[wire.name].width}`);
      console.warn(`Wire width mismatch for ${wire.name}: expected ${wire.width}, got ${env[wire.name].width}`);
    }
  }

  return env;
}

export function value2str(value: Value, type: 'bin' | 'dec' | 'hex'): string {
  switch (type) {
    case 'bin':
      return '0b' + value.value.toString(2).padStart(value.width, '0');
    case 'dec':
      return value.value.toString(10);
    case 'hex':
      return '0x' + value.value.toString(16).padStart(Math.ceil(value.width / 4), '0');
    default:
      throw new Error(`Unknown type: ${type}`);
  }
}

export function str2value(str: string, width: number): Value {
  const parsed = BigInt(str);

  return { value: BigInt.asUintN(width, parsed), width };
}

export function sortWires(mod: Module): Module {
  mod.wires = topoSort(mod.wires, mod.inputs.map(i => i.name));
  return mod;
}


function topoSort (regs: Wire[], inputs: string[]): Wire[] {
  /* ---------- 1. name → Module のマップ ---------- */
  const nodeByName: Map<string, Wire> = new Map();
  for (const m of regs) {
    if (nodeByName.has(m.name)) {
      throw new Error(`Duplicate node name: ${m.name}`);
    }
    nodeByName.set(m.name, { ...m });
  }

  /* ---------- 2. 入次数と逆向き隣接リスト ---------- */
  const indegree: Map<string, number> = new Map();
  const revAdj: Map<string, string[]> = new Map(); // 依存されている → 依存している

  const inputset = new Set(inputs);
  for (const { name, dep_list } of nodeByName.values()) {
    // 自身の indegree を初期化
    indegree.set(name, indegree.get(name) ?? 0);

    for (const d of dep_list) {
      if (inputset.has(d)) {
        // ignore
        continue;
      }
      if (!nodeByName.has(d)) {
        throw new Error(`Dependency not found: ${d}`);
      }
      indegree.set(name, (indegree.get(name) ?? 0) + 1);

      // 逆向き隣接リストを更新
      if (!revAdj.has(d)) revAdj.set(d, []);
      (revAdj.get(d) as string[]).push(name);
    }
  }

  /* ---------- 3. 入次数 0 のノードをキューへ ---------- */
  const queue: string[] = [];
  for (const [name, deg] of indegree) {
    if (deg === 0) queue.push(name);
  }

  /* ---------- 4. Kahn のループ ---------- */
  const sorted: Wire[] = [];
  while (queue.length) {
    const n = queue.shift() as string;
    sorted.push(nodeByName.get(n)!);

    for (const neighbor of revAdj.get(n) ?? []) {
      indegree.set(neighbor, (indegree.get(neighbor) as number) - 1);
      if (indegree.get(neighbor) === 0) queue.push(neighbor);
    }
  }

  /* ---------- 5. 巡回検出 ---------- */
  if (sorted.length !== nodeByName.size) {
    throw new Error('Cycle detected: topological sort impossible');
  }

  console.log('Topological sort result:', sorted.map(w => w.name));

  return sorted;
}
