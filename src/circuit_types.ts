export type Expr = (
    | { type: 'constant'; value: string }
    | { type: 'register'; name: string }
    | { type: 'bin_op'; op: string; left: Expr; right: Expr }
    | { type: 'un_op'; op: string; expr: Expr }
    | { type: 'cond'; condition: Expr; trueExpr: Expr; falseExpr: Expr }
    | { type: 'concat'; exprs: Expr[] }
    | { type: 'repeat'; expr: Expr; count: Expr }
    | { type: 'slice'; expr: Expr; start: number; end: number }
    | { type: 'slice_dyn'; expr: Expr; start: Expr; width: number }
    | { type: 'select'; expr: Expr; index: Expr }
);

export interface Wire {
  name: string;
  width: number;
  value: Expr;
  dep_list: string[]; // names of dependent wires
}

export interface Module {
  // name: string;
  inputs: { name: string; width: number }[];
  wires: Wire[];
  outputs: string[]; // names of the output wires
}

export type Value = { width: number; value: bigint };
