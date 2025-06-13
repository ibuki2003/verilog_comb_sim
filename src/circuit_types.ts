export type Expr = (
    | { type: 'constant'; value: string }
    | { type: 'register'; name: string }
    | { type: 'bin_op'; op: string; left: Expr; right: Expr }
    | { type: 'un_op'; op: string; expr: Expr }
    | { type: 'cond'; condition: Expr; trueExpr: Expr; falseExpr: Expr }
    | { type: 'concat'; exprs: Expr[] }
    | { type: 'slice'; expr: Expr; start: number; end: number }
    | { type: 'select'; expr: Expr; index: number }
);

export interface Wire {
  name: string;
  width: number;
  value: Expr;
}

export interface Module {
  // name: string;
  inputs: { name: string; width: number }[];
  wires: Wire[];
  outputs: string[]; // names of the output wires
}

export type Value = { width: number; value: bigint };
