import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Branch } from '../lib/types';

interface BoxRow {
  id: string;
  branch_id: string;
  place_type: 'dukkan' | 'isyeri' | 'ev' | 'diger';
  place_name: string | null;
  address: string | null;
  status: 'aktif' | 'kaldirildi';
}

const PLACE_TYPES: { value: BoxRow['place_type']; label: string }[] = [
  { value: 'dukkan', label: 'Dükkân' },
  { value: 'isyeri', label: 'İşyeri' },
  { value: 'ev', label: 'Ev' },
  { value: 'diger', label: 'Diğer' },
];

interface Props {
  branches: Branch[];
  onChanged: () => void;
}

// Admin: kumbara ekleme, düzenleme, listeleme, kaldırma ve geri alma.
export function BoxManager({ branches, onChanged }: Props) {
  const [boxes, setBoxes] = useState<BoxRow[]>([]);
  const [filterBranch, setFilterBranch] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Yeni kumbara formu
  const [branchId, setBranchId] = useState('');
  const [placeType, setPlaceType] = useState<BoxRow['place_type']>('dukkan');
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  // Düzenleme
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eBranch, setEBranch] = useState('');
  const [eType, setEType] = useState<BoxRow['place_type']>('dukkan');
  const [eName, setEName] = useState('');
  const [eAddress, setEAddress] = useState('');

  const loadBoxes = useCallback(async () => {
    const { data, error } = await supabase
      .from('boxes')
      .select('id, branch_id, place_type, place_name, address, status')
      .order('place_name');
    if (error) setError(error.message);
    else setBoxes((data ?? []) as BoxRow[]);
  }, []);

  useEffect(() => {
    loadBoxes();
  }, [loadBoxes]);

  // Şube listesi gelince ilk şubeyi varsayılan yap
  useEffect(() => {
    if (!branchId && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);

  async function addBox(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!branchId) {
      setError('Önce bir şube seçin.');
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
      setError(error.message);
      return;
    }
    setPlaceName('');
    setAddress('');
    await loadBoxes();
    onChanged();
  }

  function startEdit(b: BoxRow) {
    setError(null);
    setEditingId(b.id);
    setEBranch(b.branch_id);
    setEType(b.place_type);
    setEName(b.place_name ?? '');
    setEAddress(b.address ?? '');
  }

  async function saveEdit(id: string) {
    setError(null);
    if (!eBranch) {
      setError('Bir şube seçin.');
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('boxes')
      .update({
        branch_id: eBranch,
        place_type: eType,
        place_name: eName.trim() || null,
        address: eAddress.trim() || null,
      })
      .eq('id', id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingId(null);
    await loadBoxes();
    onChanged();
  }

  async function setStatus(id: string, status: BoxRow['status']) {
    setError(null);
    const { error } = await supabase.from('boxes').update({ status }).eq('id', id);
    if (error) {
      setError(error.message);
      return;
    }
    await loadBoxes();
    onChanged();
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const typeLabel = (t: BoxRow['place_type']) => PLACE_TYPES.find((p) => p.value === t)?.label ?? t;

  const visible = boxes.filter(
    (b) =>
      (filterBranch === '' || b.branch_id === filterBranch) &&
      (showRemoved || b.status === 'aktif'),
  );

  return (
    <section>
      <h3>Kumbara yönetimi</h3>

      <form className="card" onSubmit={addBox}>
        <div className="form-row">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select value={placeType} onChange={(e) => setPlaceType(e.target.value as BoxRow['place_type'])}>
            {PLACE_TYPES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <input
            placeholder="Yer adı (örn. Yılmaz Market)"
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
          />
          <input
            placeholder="Adres (isteğe bağlı)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <button type="submit" disabled={busy || branches.length === 0}>Kumbara ekle</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>

      <div className="form-row" style={{ margin: '10px 0' }}>
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
          <option value="">Tüm şubeler</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showRemoved}
            onChange={(e) => setShowRemoved(e.target.checked)}
            style={{ flex: 'none' }}
          />
          Kaldırılanları da göster
        </label>
        <span className="muted small">{visible.length} kumbara</span>
      </div>

      <ul className="list">
        {visible.map((b) =>
          editingId === b.id ? (
            <li key={b.id} className="card">
              <div className="form-row">
                <select value={eBranch} onChange={(e) => setEBranch(e.target.value)}>
                  {branches.map((br) => (
                    <option key={br.id} value={br.id}>{br.name}</option>
                  ))}
                </select>
                <select value={eType} onChange={(e) => setEType(e.target.value as BoxRow['place_type'])}>
                  {PLACE_TYPES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Yer adı" />
                <input value={eAddress} onChange={(e) => setEAddress(e.target.value)} placeholder="Adres" />
              </div>
              <div className="actions">
                <button disabled={busy} onClick={() => saveEdit(b.id)}>Kaydet</button>
                <button className="ghost" onClick={() => setEditingId(null)}>İptal</button>
              </div>
            </li>
          ) : (
            <li key={b.id} className="card row">
              <div>
                <strong>{b.place_name || typeLabel(b.place_type)}</strong>
                <span className="muted small"> · {typeLabel(b.place_type)} · {branchName(b.branch_id)}</span>
                {b.address && <div className="muted small">{b.address}</div>}
              </div>
              {b.status === 'aktif' ? (
                <div className="form-row">
                  <button className="ghost" onClick={() => startEdit(b)}>Düzenle</button>
                  <button className="ghost" onClick={() => setStatus(b.id, 'kaldirildi')}>Kaldır</button>
                </div>
              ) : (
                <div className="form-row">
                  <span className="badge bekliyor">Kaldırıldı</span>
                  <button className="ghost" onClick={() => setStatus(b.id, 'aktif')}>Geri al</button>
                </div>
              )}
            </li>
          ),
        )}
        {visible.length === 0 && <p className="muted">Gösterilecek kumbara yok.</p>}
      </ul>
    </section>
  );
}
