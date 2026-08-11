import { useState } from 'react';
import { AdminLevelRow } from './AdminLevelRow';
import { useWilayahSelection } from '../hooks/useWilayahSelection';

interface WilayahAdminManagerProps {
  apiKey: string;
}

export function WilayahAdminManager({ apiKey }: WilayahAdminManagerProps) {
  const { selection, setProvinsi, setKabupaten, setKecamatan, setDesa } = useWilayahSelection();
  const [refreshToken, setRefreshToken] = useState(0);

  function handleMutated() {
    setRefreshToken((t) => t + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminLevelRow
        label="Provinsi"
        level={1}
        selected={selection.provinsi}
        onSelect={setProvinsi}
        apiKey={apiKey}
        refreshToken={refreshToken}
        onMutated={handleMutated}
      />
      <AdminLevelRow
        label="Kabupaten/Kota"
        level={2}
        parentKode={selection.provinsi?.kode}
        selected={selection.kabupaten}
        onSelect={setKabupaten}
        apiKey={apiKey}
        refreshToken={refreshToken}
        onMutated={handleMutated}
      />
      <AdminLevelRow
        label="Kecamatan"
        level={3}
        parentKode={selection.kabupaten?.kode}
        selected={selection.kecamatan}
        onSelect={setKecamatan}
        apiKey={apiKey}
        refreshToken={refreshToken}
        onMutated={handleMutated}
      />
      <AdminLevelRow
        label="Kelurahan/Desa"
        level={4}
        parentKode={selection.kecamatan?.kode}
        selected={selection.desa}
        onSelect={setDesa}
        apiKey={apiKey}
        refreshToken={refreshToken}
        onMutated={handleMutated}
      />
    </div>
  );
}
