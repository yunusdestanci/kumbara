import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Branch } from '../lib/types';

interface Props {
  branches: Branch[];
  onChanged: () => void;
}

// Admin: şube ekleme ve pasife alma. Şube giriş hesabı bu ekranda oluşturulmaz.
export function BranchManager({ branches, onChanged }: Props) {
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [responsible, setResponsible] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addBranch(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) {
      setErr('Şube adı zorunlu.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('branches').insert({
      name: name.trim(),
      district: district.trim() || null,
      responsible_name: responsible.trim() || null,
      active: true,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setName('');
    setDistrict('');
    setResponsible('');
    onChanged();
  }

  async function setActive(id: string, active: boolean) {
    setErr(null);
    const { error } = await supabase.from('branches').update({ active }).eq('id', id);
    if (error) setErr(error.message);
    else onChanged();
  }

  return (
    <section>
      <h3>Şubeler</h3>

      <form className="card" onSubmit={addBranch}>
        <h3 style={{ marginTop: 0 }}>Yeni şube ekle</h3>
        <div className="form-row">
          <input placeholder="Şube adı (zorunlu)" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Semt" value={district} onChange={(e) => setDistrict(e.target.value)} />
          <input placeholder="Sorumlu kişi" value={responsible} onChange={(e) => setResponsible(e.target.value)} />
          <button type="submit" disabled={busy}>Şube ekle</button>
        </div>
        {err && <p className="error">{err}</p>}
      </form>

      <ul className="list">
        {branches.map((b) => (
          <li key={b.id} className="card row">
            <div>
              <strong>{b.name}</strong>
              <div className="muted small">
                {[b.district, b.responsible_name].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            {b.active ? (
              <button className="ghost" onClick={() => setActive(b.id, false)}>Pasife al</button>
            ) : (
              <div className="form-row">
                <span className="badge bekliyor">Pasif</span>
                <button className="ghost" onClick={() => setActive(b.id, true)}>Aktifleştir</button>
              </div>
            )}
          </li>
        ))}
        {branches.length === 0 && <p className="muted">Henüz şube yok.</p>}
      </ul>
    </section>
  );
}
