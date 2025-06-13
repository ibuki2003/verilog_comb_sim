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
  </ul>
);

export default ShowValue;
