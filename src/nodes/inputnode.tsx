import { useEffect, useState } from 'react';
import { Handle, Position} from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import ShowValue from '../components/showvalue';
import type { Value } from '../circuit_types';
import { str2value } from '../circuit';

export type InputNode = Node<{
  name: string;
  width: number;
  onChange: (newvalue: Value) => void;
}, 'input'>;

const InputNode: React.FC<NodeProps<InputNode>> = ({ id, data }) => {
  const [val, setval] = useState('0');
  const [pval, setpval] = useState<Value>({ width: 1, value: 0n });

  useEffect(() => {
    try {
      const parsed = str2value(val, data.width);
      setpval(parsed);
      data.onChange(parsed);
    } catch (e) {
      console.warn(e);
    }
  }, [data, data.width, val]);

  return (
    <div className="node-input">
      <div className="label">
        {data.name}
        {data.width != 1 && `[${data.width-1}:0]`}
      </div>
      <input
        id={`input-${id}`}
        name="value"
        type="text"
        onChange={(e) => setval(e.target.value)}
        className="nodrag"
        value={val}
      />
      <hr />
      <ShowValue value={pval} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default InputNode;
