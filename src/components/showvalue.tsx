import { value2str } from '../circuit';
import type { Value } from '../circuit_types';

type ShowValueProps = {
  value: Value;
};

const ShowValue: React.FC<ShowValueProps> = ({value}) => (
  <ul className="value-table">
    <li>{value2str(value, "bin")}</li>
    <li>{value2str(value, "dec")}</li>
    <li>{value2str(value, "hex")}</li>
    { value.width == 32 && (
      <li>{u32tof32(value.value) + "f"}</li>
    )}
  </ul>
);

function u32tof32(value: bigint): number {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, Number(value & BigInt(0xFFFFFFFF)));
  return view.getFloat32(0, false);
}

export default ShowValue;
