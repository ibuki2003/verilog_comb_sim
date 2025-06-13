/// Combinational Logic Circuit Simulator

import type { Module, Value, Expr } from "./circuit_types";

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
    const value_ = value & ones(width);

    // 既存のビット列を左にシフト → 新しいフィールドを OR
    accValue = (accValue << BigInt(width)) | value_;
    accWidth += width;
  }

  return { width: accWidth, value: accValue };
}

export function evalExpr(expr: Expr, inputs: Env): Value {
  switch (expr.type) {
    case 'constant':
      return { width: expr.value.length, value: BigInt(expr.value) };
    case 'register':
      return inputs[expr.name];

    case 'bin_op': {
      const { width: lb, value: l } = evalExpr(expr.left, inputs);
      const { value: r } = evalExpr(expr.right, inputs);
      switch (expr.op) {
        // accept lb != rb, but use the left width for the result
        case '+': return { width: lb, value: (l + r) & ones(lb) };
        case '-': return { width: lb, value: (l - r) & ones(lb) };
        case '*': return { width: lb, value: (l * r) & ones(lb) };
        case '/': return { width: lb, value: (r === BigInt(0) ? BigInt(0) : (l / r)) & ones(lb) };
        case '&': return { width: lb, value: l & r};
        case '|': return { width: lb, value: l | r};
        case '^': return { width: lb, value: l ^ r};

        case '<<': return { width: lb, value: (l << r) & ones(lb) };
        case '>>': return { width: lb, value: l >> r };
        case '>>>': {
          // mathematical right shift
          // NOTE: here we assume that lhs are signed while l is always positive
          // so we need to sign-extend the value
          const is_negative = !!(l >> (BigInt(lb) - BigInt(1)));
          const l_ = is_negative ? (l | (~ones(lb))) : l; // sign-extend if negative
          const shifted = (l_ >> BigInt(r)) & ones(lb);
          return { width: lb, value: shifted };
        }
        default: throw new Error(`Unknown binary operator: ${expr.op}`);
      }
    }
    case 'un_op': {
      const {width, value} = evalExpr(expr.expr, inputs);
      switch (expr.op) {
        case '-': return { width, value: (-value) & ones(width) };
        case '~': return { width, value: (~value) & ones(width) };
        case '!':
          // logical NOT, returns 1 if value is 0, otherwise 0
          return { width: 1, value: BigInt(!value ? 1 : 0) };
        default: throw new Error(`Unknown unary operator: ${expr.op}`);
      }
    }
    case 'cond': {
      const condition = evalExpr(expr.condition, inputs);
      return condition ? evalExpr(expr.trueExpr, inputs) : evalExpr(expr.falseExpr, inputs);
    }

    case 'concat':
      return concatValues(expr.exprs.map(e => evalExpr(e, inputs)));

    case 'slice': {
      const base = Math.min(expr.start, expr.end);
      const width = Math.abs(expr.start - expr.end) + 1;
      const val = evalExpr(expr.expr, inputs);
      if (base + width > val.width) {
        throw new Error(`Slice out of range: start=${expr.start}, end=${expr.end}, width=${val.width}`);
      }
      // Extract bits from start to end (exclusive)
      const shifted = val.value >> BigInt(expr.start);
      const masked = shifted & ones(width);
      return { width, value: masked };
    }

    case 'select': {
      const val = evalExpr(expr.expr, inputs);
      if (expr.index < 0 || expr.index >= val.width) {
        throw new Error(`Index out of range: index=${expr.index}, width=${val.width}`);
      }
      // Extract single bit at index
      const bit = (val.value >> BigInt(expr.index)) & 1n;
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
