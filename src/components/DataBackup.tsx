import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';

// Yedeğe dahil edilen tablolar. Kullanıcı kimlik bilgileri (auth.users) buraya dahil değildir.
const TABLES = [
  'branches',
  'boxes',
  'periods',
  'collections',
  'handovers',
  'expenses',
  'central_incomes',
  'audit_log',
] as const;

// Tüm verileri tek bir JSON dosyası olarak indirir. Düzenli yedek için ayda bir alınması önerilir.
export function DataBackup() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      const tables: Record<string, Record<string, unknown>[]> = {};
      for (const t of TABLES) {
        tables[t] = await fetchAll<Record<string, unknown>>((a, b) => supabase.from(t).select('*').range(a, b));
      }
      const exportedAt = new Date();
      const payload = { exported_at: exportedAt.toISOString(), tables };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const day = exportedAt.toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kumbara-yedek-${day}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const counts = TABLES.map((t) => `${t}: ${tables[t].length}`).join(' · ');
      setDone(`Yedek indirildi. ${counts}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Yedek alınamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h3>Veri yedeği</h3>
      <p className="muted small">
        Şubeler, kumbaralar, dönemler, toplamalar, teslimler, harcamalar, merkez girişleri ve işlem geçmişi tek bir
        dosyada indirilir. Dosyayı güvenli bir yerde saklayın; içinde kişisel veri bulunur.
      </p>
      <div className="card">
        <button onClick={download} disabled={busy}>
          {busy ? 'Yedek hazırlanıyor…' : 'Tüm verileri indir (JSON)'}
        </button>
        {done && <p className="badge onaylandi" style={{ marginTop: 10 }}>{done}</p>}
        {err && <p className="error" style={{ marginTop: 10 }}>{err}</p>}
      </div>
    </section>
  );
}
