import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  branchId: string;
  onAdded: () => void;
}

// Şube kullanıcısı için: sadece kendi şubesine kumbara ekler.
export function AddBoxForm({ branchId, onAdded }: Props) {
  const [placeType, setPlaceType] = useState<'dukkan' | 'isyeri' | 'ev' | 'diger'>('dukkan');
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!placeName.trim() && !address.trim()) {
      setErr('En az yer adı ya da adres yazın.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('boxes').insert({
      branch_id: branchId,
      place_type: placeType,
      place_name: placeName.trim() || null,
      address: address.trim() || null,
      status: 'aktif',
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setPlaceName('');
    setAddress('');
    onAdded();
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>Yeni kumbara ekle</h3>
      <div className="form-row">
        <select value={placeType} onChange={(e) => setPlaceType(e.target.value as typeof placeType)}>
          <option value="dukkan">Dükkân</option>
          <option value="isyeri">İşyeri</option>
          <option value="ev">Ev</option>
          <option value="diger">Diğer</option>
        </select>
        <input placeholder="Yer adı (örn. Yılmaz Market)" value={placeName} onChange={(e) => setPlaceName(e.target.value)} />
        <input placeholder="Adres" value={address} onChange={(e) => setAddress(e.target.value)} />
        <button type="submit" disabled={busy}>Ekle</button>
      </div>
      {err && <p className="error">{err}</p>}
    </form>
  );
}
