import { useState } from 'react';
import { WilayahDropdown, type WilayahSelection } from './components/WilayahDropdown';

function App() {
  const [selection, setSelection] = useState<WilayahSelection | null>(null);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Alamat</h1>
      <WilayahDropdown onChange={setSelection} />
      {selection && (
        <pre className="mt-6 rounded-md bg-gray-50 p-4 text-xs text-gray-700">
          {JSON.stringify(selection, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default App;
