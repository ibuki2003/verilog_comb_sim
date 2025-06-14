import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.scss'
import type { Module, Value } from './circuit_types'
import { simulateCircuit } from './circuit'
import { ReactFlow, useNodesState, useEdgesState, useReactFlow, Panel } from '@xyflow/react'
import type { Edge } from '@xyflow/react';
import Dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import { parseVerilogModule } from './parser';

import RegisterNodeComponent, {type RegisterNode}  from "./nodes/registernode";
import InputNodeComponent, {type InputNode} from "./nodes/inputnode";

const nodeTypes = {
  input: InputNodeComponent,
  register: RegisterNodeComponent,
};

type Node = InputNode | RegisterNode;

function nodeWidth(bitwidth: number): number {
  return Math.max(bitwidth * 8, 150);
}

const App: React.FC = () => {
  const [mod, setMod] = useState<Module>({ inputs: [], wires: [], outputs: [] });
  const textarearef = useRef<HTMLTextAreaElement>(null);

  const [inputs, setInputs] = useState<{ [name: string]: Value }>({});

  const { fitView, updateNodeData } = useReactFlow<Node, Edge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const onLayout = useCallback(
    () => {
      console.log(nodes);
      console.log(edges);
      const layouted = getLayoutedElements(nodes, edges);

      setNodes([...layouted.nodes]);
      setEdges([...layouted.edges]);

      fitView();
    },
    [nodes, edges, setNodes, setEdges, fitView],
  );

  const updateMod = useCallback(async () => {

    const code = textarearef.current?.value;
    if (!code) return;
    try {
      const parsedModule = await parseVerilogModule(code);
      if (!parsedModule) {
        console.error("Failed to parse Verilog module");
        return;
      }
      setMod(parsedModule);

      setInputs(oldInputs => {
        const newInputs = { ...oldInputs };

        // Remove inputs that are no longer in the module
        const input_names = new Set(parsedModule.inputs.map(input => input.name));
        for (const name in oldInputs) {
          if (!input_names.has(name)) {
            delete newInputs[name];
          }
        }

        parsedModule.inputs.forEach(input => {
          if (!(input.name in newInputs)) {
            newInputs[input.name] = { width: input.width, value: 0n };
          } else if (newInputs[input.name].width !== input.width) {
            newInputs[input.name].width = input.width;
            newInputs[input.name].value = BigInt(0);
          }
        });

        return newInputs;
      });
    } catch (error) {
      console.error("Error parsing Verilog module:", error);
    }
  }, []);

  useEffect(() => {
    setNodes(oldnodes => {
      console.log(mod.inputs, mod.wires);
      const pos = Object.fromEntries(oldnodes.map(node => [node.id, node.position]));
      const inputNodes = mod.inputs.map<InputNode>((input, index) => ({
        id: input.name,
        type: "input",
        width: nodeWidth(input.width),
        data: {
          name: input.name,
          width: input.width,
          onChange: (v) => setInputs((old) => ({ ...old, [input.name]: v })),
        },
        position: pos[input.name] ?? { x: index * 150, y: 0 },
      }));
      const wireNodes = mod.wires.map<RegisterNode>((wire, index) => ({
        id: wire.name,
        type: "register",
        width: nodeWidth(wire.width),
        data: {
          name: wire.name,
          width: wire.width,
          value: {
            width: wire.width,
            value: 0n,
          },
        },
        position: pos[wire.name] ?? { x: index * 150, y: 100 },
      }));
      return [
        ...inputNodes,
        ...wireNodes,
      ]
    });
  }, [mod.inputs, mod.wires, setNodes]);

  useEffect(() => {
    // HACK: update simultaneously can cause issues with React Flow?
    setTimeout(() => {
      const result = simulateCircuit(mod, inputs);

      Object.entries(result).forEach(([name, value]) => {
        if (!(name in inputs))
          updateNodeData(name, { value });
      });
    }, 10);
  }, [mod, inputs, updateNodeData]);



  useEffect(() => {
    setEdges(mod.wires.flatMap(wire =>
        wire.dep_list.map(dep => ({
          id: `${dep}-${wire.name}`,
          source: dep,
          target: wire.name,

        }))
    ));
  }, [setEdges, mod.wires]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onBeforeDelete={async () => false} // Prevent deletion of nodes
        nodesConnectable={false}
        fitView
      >
        <Panel position="bottom-right">
          <button onClick={onLayout}>Layout</button>
          <textarea ref={textarearef} rows={10} />
          <button onClick={updateMod}>update</button>
        </Panel>
      </ReactFlow>
    </>
  )
}


const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: '' });

  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  nodes.forEach((node) =>
    g.setNode(node.id, {
      ...node,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    }),
  );

  Dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const position = g.node(node.id);
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      const x = position.x - (node.measured?.width ?? 0) / 2;
      const y = position.y - (node.measured?.height ?? 0) / 2;

      return { ...node, position: { x, y } };
    }),
    edges,
  };
};

export default App;
