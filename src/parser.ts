import { sortWires } from "./circuit";
import type { Expr, Module } from "./circuit_types";
import { Parser, Language, Tree, Node } from "web-tree-sitter";

type NodeWithType<Ty extends string> = Node & { type: Ty };

let globalParser: Parser | null = null;

async function initParser() {
  if (globalParser) return globalParser;
  await Parser.init({
    locateFile(scriptName: string) {
      return '/' + scriptName;
    },
  });
  const parser = new Parser();
  parser.setLanguage(await Language.load('tree-sitter-verilog.wasm'));
  globalParser = parser;
  return globalParser;
}

const COMMENT_REGEX_INLINE = /\/\/.*$/gm;
const COMMENT_REGEX_BLOCK = /\/\*[\s\S]*?\*\//gs;

export async function parseVerilog(code: string): Promise<Tree | null> {
const code_ = code
  .replace(COMMENT_REGEX_INLINE, '')
  .replace(COMMENT_REGEX_BLOCK, '');

  const parser = await initParser();
  try {
    return parser.parse(code_);
  } catch (error) {
    // throw new Error(`Parsing error: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`Parsing error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}


const SLICE_REGEX = /\[(\d+):(\d+)\]/;

function getDescendantByPath<Ty extends string>(node: Node, path: [...string[], Ty]): NodeWithType<Ty> | null {
  let currentNode: Node | null = node;
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    if (!currentNode) return null;
    if (i === path.length - 2 && segment === '*') {
      return currentNode.descendantsOfType(path[i + 1])[0] as NodeWithType<Ty> || null;
    }

    currentNode = currentNode.children.find(child => child?.type === segment) || null;
  }
  return currentNode as NodeWithType<Ty>;
}

export async function parseVerilogModule(code: string): Promise<Module | null> {
  const tree = await parseVerilog(code);
  if (!tree) { return null; }
  const root = tree.rootNode;
  if (root.type !== 'source_file') {
    console.error('Root node is not a module declaration');
    return null;
  }
  const module = root.children.find((node) => node?.type === 'module_declaration');
  if (!module) {
    console.error('No module declaration found in the source file');
    return null;
  }

  // console.log(JSON.stringify(node2json(module), null, 2));

  let found_error = false;
  module.descendantsOfType('ERROR').forEach((errNode) => {
    if (!errNode) return;
    found_error = true;
    console.error(`Error at ${errNode.startPosition.row}:${errNode.startPosition.column} - ${errNode.text}`);
  });
  if (found_error) {
    return null;
  }


  const ret: Module = {
    inputs: [],
    wires: [],
    outputs: [],
  };

  const wire_decls: Map<string, {width: number}> = new Map();

  // parse ports
  module.descendantsOfType('ansi_port_declaration').forEach((node) => {
    if (!node) return;

    const direction = getDescendantByPath(node, ['net_port_header', 'port_direction'])?.text || '';
    // const name = node.descendantsOfType('port_identifier')[0]?.text || '';
    const name = getDescendantByPath(node, ['simple_identifier'])?.text || '';
    const dim = getDescendantByPath(node, [
      'net_port_header',
      'net_port_type',
      '*',
      'packed_dimension',
    ])?.text || '';

    const match = dim.match(SLICE_REGEX);
    const width = match ? Math.abs(parseInt(match[1]) - parseInt(match[2])) + 1 : 1;

    console.log(`Port: ${name}, Direction: ${direction}, Width: ${width}`);

    if (direction.trim() === 'input') {
      ret.inputs.push({ name, width, });
    } else {
      wire_decls.set(name, { width });
      ret.outputs.push(name);
    }
  });

  // wire declarations
  module.descendantsOfType('net_declaration').forEach((node) => {
    if (!node) return;
    const dim = getDescendantByPath(node, ['data_type_or_implicit', '*', 'packed_dimension'])?.text || '';
    const match = dim.match(SLICE_REGEX);
    const width = match ? Math.abs(parseInt(match[1]) - parseInt(match[2])) + 1 : 1;

    node.descendantsOfType('net_decl_assignment').forEach((anode) => {
      if (!anode) return;
      const name = getDescendantByPath(anode, ['simple_identifier'])?.text || '';
      const expr = getDescendantByPath(anode, ['expression']);
      console.log(`Wire: ${name}, Width: ${width}`);
      if (expr) {
        const exprp = parse_expr(expr);
        if (!exprp) {
          console.warn(`Failed to parse expression for wire: ${name} (${expr.text})`);
          return;
        }

        ret.wires.push({
          name: name,
          width: width,
          value: exprp.expr,
          dep_list: exprp.deps,
        });
      } else {
        wire_decls.set(name, { width });
      }
    });
  });

  // assignments
  module.descendantsOfType('continuous_assign').forEach((node) => {
    if (!node) return;
    const list = node.descendantsOfType('list_of_net_assignments')[0];
    if (!list) return;
    list.descendantsOfType('net_assignment').forEach((anode) => {
      if (!anode) return;
      const lvalue = getDescendantByPath(anode, ['net_lvalue', 'simple_identifier']);
      const rvalue = getDescendantByPath(anode, ['expression']);
      if (!lvalue || !rvalue) {
        console.warn('Incomplete net assignment found', anode.text);
        return;
      }
      const expr = parse_expr(rvalue);
      if (!expr) {
        console.warn(`Failed to parse expression for net assignment: ${lvalue.text} (${rvalue.text})`);
        return;
      }

      const name = lvalue.text;
      const decl = wire_decls.get(name);
      if (!decl) {
        console.warn(`Wire declaration not found for: ${name}`);
        return;
      }
      ret.wires.push({
        name: name,
        width: decl.width,
        value: expr.expr,
        dep_list: expr.deps,
      });

    });
  });

  // check duplicates
  const inputNames = new Set<string>(ret.inputs.map(input => input.name));
  const wireNames = new Set<string>();
  ret.wires.forEach((wire) => {
    if (inputNames.has(wire.name)) {
      console.warn(`Invalid assignment found for input: ${wire.name}`);
      return;
    }
    if (wireNames.has(wire.name)) {
      console.warn(`Duplicate assignment found for: ${wire.name}`);
    } else {
      wireNames.add(wire.name);
    }
  });

  return sortWires(ret);
}

function node2json(node: Node | null): unknown {
  if (!node) return null;
  return {
    type: node.type,
    text: node.text,
    children: node.children.map(node2json),
  };
}

type ParsedExpr = { expr: Expr, deps: string[] };

function parse_expr(node: NodeWithType<'expression'> | null): ParsedExpr  | null {
  if (!node) return null;

  if (node.children.length === 1) {
    switch (node.children[0]?.type) {
      case 'primary':
        return parsePrimaryExpr(node.children[0] as NodeWithType<'primary'>);

      case 'conditional_expression': {
        const c = node.children[0].children;
        const cond = parse_expr(getDescendantByPath(c[0]!, ['expression']));
        const trueExpr = parse_expr(c[2] as NodeWithType<'expression'>);
        const falseExpr = parse_expr(c[4] as NodeWithType<'expression'>);
        if (!cond || !trueExpr || !falseExpr) {
          console.warn(`Failed to parse conditional expression: ${node.text}`);
          return null;
        }
        return {
          expr: {
            type: 'cond',
            condition: cond.expr,
            trueExpr: trueExpr.expr,
            falseExpr: falseExpr.expr,
          },
          deps: mergeDeps(
            cond.deps,
            trueExpr.deps,
            falseExpr.deps,
          ),
        };
      }
      default: return null;
    }
  }

  if (node.children.length === 2) {
    if (node.children[0]?.type === 'unary_operator' && node.children[1]?.type === 'primary') {
      // Unary operations
      const op = node.children[0]?.text.trim();
      const expr = parsePrimaryExpr(node.children[1] as NodeWithType<'primary'>);
      if (!expr || !op) {
        console.warn(`Failed to parse unary operation: ${node.text}`);
        return null;
      }
      return {
        expr: {
          type: 'un_op',
          op: op,
          expr: expr.expr,
        },
        deps: expr.deps,
      };
    }
  }

  if (node.children.length === 3) {
    // Binary operations
    const left = parse_expr(node.children[0] as NodeWithType<'expression'>);
    const right = parse_expr(node.children[2] as NodeWithType<'expression'>);
    const op = node.children[1]?.text.trim();
    if (!left || !right || !op) {
      console.warn(`Failed to parse binary operation: ${node.text}`);
      return null;
    }
    return {
      expr: {
        type: 'bin_op',
        op: op,
        left: left.expr,
        right: right.expr,
      },
      deps: mergeDeps(left.deps, right.deps),
    };
  }




  console.warn(`Unhandled expression: ${node.text}`);
  return null;
}

function parsePrimaryExpr(node: NodeWithType<'primary' | 'variable_lvalue'> | null): ParsedExpr | null {
  if (!node) return null;

  const children = node.children.slice().filter((child) => child?.type !== 'comment' && child?.type !== 'whitespace');
  if (children[0]?.type == '(' && children[children.length - 1]?.type == ')') {
    children.shift();
    children.pop();
  }

  if (children.length === 1) {
    switch (children[0]?.type) {
      case 'primary_literal': {
        return {
          expr: {
            type: 'constant',
            value: children[0].text,
          },
          deps: [],
        };
      }
      case 'simple_identifier':
      case 'hierarchical_identifier':
      {
        return {
          expr: {
            type: 'register',
            name: children[0].text,
          },
          deps: [children[0].text],
        };
      }
      case 'mintypmax_expression': {
        return parse_expr(getDescendantByPath(children[0], ['expression']));
      }
      case 'concatenation':
        return parseConcatExpr(children[0] as NodeWithType<'concatenation'>);
      case 'multiple_concatenation': {
        // repeating
        const countexpr = children[0].children[1];
        const repexpr = children[0].children[2];
        const count = parse_expr(countexpr as NodeWithType<'expression'>);
        const rep = parseConcatExpr(repexpr as NodeWithType<'concatenation'>);
        if (!count || !rep) {
          console.warn(`Failed to parse multiple concatenation: ${children[0].text}`);
          return null;
        }
        return {
          expr: {
            type: 'repeat',
            expr: rep.expr,
            count: count.expr,
          },
          deps: mergeDeps(count.deps, rep.deps),
        };
      }
      // case 'inc_or_dec_expression': {
      // }

    }
  } else if (children.length === 2) {
    if (children[0]?.type.endsWith('_identifier') && children[1]?.type === 'select') {
      // Handle select operation
      const identifier = children[0].text;
      const select_bit = getDescendantByPath(children[1], ['bit_select']);
      const select_range = getDescendantByPath(children[1], ['constant_range']);
      const select_dyn = getDescendantByPath(children[1], ['indexed_range']);

      if (select_range) {
        // slice
        // const [start, end] = select_range.text.split(':').map((s) => parseInt(s, 10));
        const start = select_range.children[0]?.text ?? '0';
        const end = select_range.children[2]?.text ?? '0';
        // NOTE: danger eval
        const startNum = eval(start);
        const endNum = eval(end);
        return {
          expr: {
            type: 'slice',
            expr: { type: 'register', name: identifier },
            start: startNum,
            end: endNum,
          },
          deps: [identifier],
        };
      } else if (select_bit) {
        // single bit select
        const expr = getDescendantByPath(select_bit, ['expression']);
        const idx = parse_expr(expr);
        if (!idx) { return null; }
        return {
          expr: {
            type: 'select',
            expr: { type: 'register', name: identifier },
            index: idx.expr,
          },
          deps: mergeDeps([identifier], idx.deps),
        };
      } else if (select_dyn) {
        const base = parse_expr(select_dyn.children[0] as NodeWithType<'expression'>);
        const width = eval(select_dyn.children[2]?.text || '1');
        if (!base) {
          console.warn(`Failed to parse dynamic select: ${children[1].text}`);
          return null;
        }
        return {
          expr: {
            type: 'slice_dyn',
            expr: { type: 'register', name: identifier },
            start: base.expr,
            width: width,
          },
          deps: mergeDeps([identifier], base.deps),
        };
      }
      console.warn(`Unhandled select operation: ${children[1].text}`);
      return null;
    }
  }
  console.warn(`Unhandled primary expression: ${node.text}`);
  return null;
}

function parseConcatExpr(node: NodeWithType<'concatenation'>): ParsedExpr | null {
  const exprs: Expr[] = [];
  const deps: string[] = [];
  node.children
    .filter((child) => child?.type === 'expression')
    .forEach((exprNode) => {
      const exprp = parse_expr(exprNode as NodeWithType<'expression'>);
      if (exprp) {
        exprs.push(exprp.expr);
        deps.push(...exprp.deps);
      } else {
        console.warn(`Failed to parse concatenation expression: ${exprNode?.text}`);
      }
    });
  return {
    expr: {
      type: 'concat',
      exprs,
    },
    deps: mergeDeps(deps),
  };
}

function mergeDeps(...arrays: string[][]): string[] {
  const set = new Set<string>();
  arrays.forEach(arr => arr.forEach(item => set.add(item)));
  return Array.from(set);
}
