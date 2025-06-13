import { Handle, Position} from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import ShowValue from '../components/showvalue';
import type { Value } from '../circuit_types';

export type RegisterNode = Node<{
  name: string;
  value: Value;
}, 'register'>;

const InputNode: React.FC<NodeProps<RegisterNode>> = ({ data }) => {
  return (
    <div className="node-register">
      <Handle type="target" position={Position.Top} />
      <div className="label">
        {data.name}
        {data.value.width != 1 && `[${data.value.width-1}:0]`}
      </div>
      <ShowValue value={data.value} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default InputNode;
