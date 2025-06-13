import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.scss'
import type { Module, Value } from './circuit_types'
import { simulateCircuit } from './circuit'
import { ReactFlow, useNodesState, useEdgesState, useReactFlow, Panel } from '@xyflow/react'
import type { Edge } from '@xyflow/react';
import Dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';

import RegisterNodeComponent, {type RegisterNode}  from "./nodes/registernode";
import InputNodeComponent, {type InputNode} from "./nodes/inputnode";

const mod: Module = {
  inputs: [{ name: 'a', width: 8 }, { name: 'b', width: 8 }],
  wires: [
    {
      name: 'c',
      width: 8,
      value: {
        type: 'bin_op',
        op: '+',
        left: { type: 'register', name: 'a' },
        right: { type: 'register', name: 'b' },
      },
      dep_list: ['a', 'b'],
    },
    {
      name: 'd',
      width: 8,
      value: {
        type: 'bin_op',
        op: '*',
        left: { type: 'register', name: 'a' },
        right: { type: 'register', name: 'b' },
      },
      dep_list: ['a', 'b'],
    },
  ],
  outputs: ['c', 'd']
}

const nodeTypes = {
  input: InputNodeComponent,
  register: RegisterNodeComponent,
};

type Node = InputNode | RegisterNode;

const App: React.FC = () => {
  const [inputs, setInputs] = useState<{ [name: string]: Value }>(() => (
    Object.fromEntries(mod.inputs.map(input => [input.name, { width: input.width, value: 0n }])))
  );
  console.log(inputs);

  const { fitView, updateNodeData } = useReactFlow<Node, Edge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);


  const result = useMemo(() => {
    return simulateCircuit(mod, inputs);
  }, [inputs]);

  useEffect(() => {
    const inputNodes = mod.inputs.map<InputNode>((input, index) => ({
      id: input.name,
      type: "input",
      data: {
        name: input.name,
        width: input.width,
        value: "",
        parsedValue: { width: 1, value: 0n },
        onChange: (v) => setInputs((old) => ({ ...old, [input.name]: v })),
      },
      position: { x: index * 150, y: 0 },
    }));
    const wireNodes = mod.wires.map<RegisterNode>((wire, index) => ({
      id: wire.name,
      type: "register",
      data: {
        name: wire.name,
        value: {
          width: wire.width,
          value: 0n,
        },
      },
      position: { x: index * 150, y: 100 },
    }));
    setNodes([
      ...inputNodes,
      ...wireNodes,
    ]);
  }, [setNodes]);

  useEffect(() => {
    Object.entries(result).forEach(([name, value]) => {
      if (!(name in inputs))
        updateNodeData(name, { value });
    });
  }, [inputs, result, setNodes, updateNodeData]);


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

  useEffect(() => {
    setEdges(mod.wires.flatMap(wire =>
        wire.dep_list.map(dep => ({
          id: `${dep}-${wire.name}`,
          source: dep,
          target: wire.name,

        }))
    ));
  }, [setEdges]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesConnectable={false}
        fitView
      >
        <Panel position="bottom-right">
          <button onClick={onLayout}>Layout</button>
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
