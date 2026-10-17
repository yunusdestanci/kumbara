import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Branch } from '../lib/types';

interface Props {
  branches: Branch[];
  onChanged: () => void;
}

// Admin: şube ekleme, düzenleme ve pasife alma. Şube giriş hesabı bu ekranda oluşturulmaz.
export function BranchManager({ branches, onChanged }: Props) {
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [responsible, setResponsible] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Düzenleme durumu
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDistrict, setEditDistrict] = useState('');
  const [editResponsible, setEditResponsible] = useState('');

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

  function startEdit(b: Branch) {
    setErr(null);
    setEditingId(b.id);
    setEditName(b.name);
    setEditDistrict(b.district ?? '');
    setEditResponsible(b.responsible_name ?? '');
  }

  async function saveEdit(id: string) {
    setErr(null);
    if (!editName.trim()) {
      setErr('Şube adı boş olamaz.');
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('branches')
      .update({
        name: editName.trim(),
        district: editDistrict.trim() || null,
        responsible_name: editResponsible.trim() || null,
      })
      .eq('id', id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setEditingId(null);
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
          <li key={b.id} className="card">
            {editingId === b.id ? (
              <div>
                <div className="form-row">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Şube adı" />
                  <input value={editDistrict} onChange={(e) => setEditDistrict(e.target.value)} placeholder="Semt" />
                  <input value={editResponsible} onChange={(e) => setEditResponsible(e.target.value)} placeholder="Sorumlu kişi" />
                </div>
                <div className="actions">
                  <button disabled={busy} onClick={() => saveEdit(b.id)}>Kaydet</button>
                  <button className="ghost" onClick={() => setEditingId(null)}>İptal</button>
                </div>
              </div>
            ) : (
              <div className="row">
                <div>
                  <strong>{b.name}</strong>
                  <div className="muted small">
                    {[b.district, b.responsible_name].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <div className="form-row">
                  <button className="ghost" onClick={() => startEdit(b)}>Düzenle</button>
                  {b.active ? (
                    <button className="ghost" onClick={() => setActive(b.id, false)}>Pasife al</button>
                  ) : (
                    <>
                      <span className="badge bekliyor">Pasif</span>
                      <button className="ghost" onClick={() => setActive(b.id, true)}>Aktifleştir</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
        {branches.length === 0 && <p className="muted">Henüz şube yok.</p>}
      </ul>
    </section>
  );
}
