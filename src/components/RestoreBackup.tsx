import { useState } from 'react';
import { supabase } from '../lib/supabase';

const LABELS: Record<string, string> = {
  branches: 'Şubeler',
  boxes: 'Kumbaralar',
  periods: 'Dönemler',
  collections: 'Toplamalar',
  collection_entries: 'Toplama ayrıntıları',
  central_incomes: 'Merkez girişleri',
  handovers: 'Teslimler',
  expenses: 'Harcamalar',
};
const ORDER = Object.keys(LABELS);

type Tables = Record<string, unknown[]>;

// Yedek dosyasından geri yükleme. Mevcut kayıtlar silinmez; yalnızca eksikler eklenir.
export function RestoreBackup() {
  const [fileName, setFileName] = useState('');
  const [tables, setTables] = useState<Tables | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  async function onFile(file: File) {
    setErr(null);
    setResult(null);
    setTables(null);
    setFileName(file.name);
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !data.tables || typeof data.tables !== 'object') {
        throw new Error('Bu dosya bir kumbara yedeği değil ("tables" alanı yok).');
      }
      setTables(data.tables as Tables);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Dosya okunamadı.');
    }
  }

  async function restore() {
    if (!tables) return;
    const total = ORDER.reduce((s, k) => s + (tables[k]?.length ?? 0), 0);
    if (!confirm(`Yedekte ${total} kayıt var. Mevcut kayıtlar silinmez, sadece eksikler eklenir. Devam edilsin mi?`)) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc('restore_backup', { payload: { tables } });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setResult(data as Record<string, number>);
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h3>Yedekten geri yükle</h3>
      <p className="muted small">
        Daha önce indirdiğiniz kumbara yedek dosyasını seçin. Veritabanında olmayan kayıtlar eklenir, mevcut kayıtlar değişmez.
        Şube giriş hesapları yedekte yoktur; geri yüklemeden sonra şube hesaplarını yeniden oluşturmanız gerekir.
      </p>
      <div className="card">
        <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {fileName && <p className="muted small">Seçilen dosya: {fileName}</p>}

        {tables && (
          <>
            <ul className="muted small" style={{ marginTop: 8 }}>
              {ORDER.map((k) => (
                <li key={k}>
                  {LABELS[k]}: {(tables[k] ?? []).length} kayıt
                </li>
              ))}
            </ul>
            <button onClick={restore} disabled={busy}>
              {busy ? 'Geri yükleniyor…' : 'Geri yükle'}
            </button>
          </>
        )}

        {result && (
          <div className="badge onaylandi" style={{ marginTop: 10, display: 'block' }}>
            Eklenen kayıtlar: {ORDER.map((k) => `${LABELS[k]} ${result[k] ?? 0}`).join(' · ')}. Yedekteki sayı bundan fazlaysa, o kayıtlar zaten veritabanında vardı ve atlandı.
          </div>
        )}
        {err && <p className="error" style={{ marginTop: 10 }}>{err}</p>}
      </div>
    </section>
  );
}
