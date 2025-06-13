import { useMemo, useState } from 'react'
import './App.css'
import type { Module } from './circuit_types'
import { simulateCircuit } from './circuit'

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

function App() {
  const [inputs, setInputs] = useState<{ [name: string]: string }>(() => (
        Object.fromEntries(mod.inputs.map(input => [input.name, '0'])))
  );

  const result = useMemo(() => {
    const input_values = Object.fromEntries(
      Object.entries(inputs).map(([name, value]) => [
        name,
        {
          // width: mod.inputs[name].width,
          width: mod.inputs.find(input => input.name === name)?.width ?? 0,
          value: BigInt(value),
        },
      ])
    );
    return simulateCircuit(mod, input_values);
  }, [inputs]);

  return (
    <>
      <div>
        { Object.entries(inputs).map(([name, value]) => (
          <div key={name}>
            <label>
              {name}:
              <input
                type="number"
                value={value}
                onChange={(e) => setInputs({ ...inputs, [name]: e.target.value })}
              />
            </label>
          </div>
        )) }
      </div>
      <hr />
      <ul>
        {mod.outputs.map(output => (
          <li key={output}>
            {output}: {result[output]?.value.toString()} (width: {result[output]?.width})
          </li>
        ))}
      </ul>
    </>
  )
}

export default App
