import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { dateTr } from '../lib/format';

interface LogRow {
  id: number;
  table_name: string;
  row_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  changed_by: string | null;
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

const TABLE_LABELS: Record<string, string> = {
  boxes: 'Kumbara',
  collections: 'Toplama',
  handovers: 'Teslim',
  expenses: 'Harcama',
};

const ACTION_LABELS: Record<LogRow['action'], string> = {
  INSERT: 'Ekleme',
  UPDATE: 'Güncelleme',
  DELETE: 'Silme',
};

// Admin: son değişiklikler (kim, ne zaman, neyi değiştirdi).
export function AuditLog() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [logRes, profRes] = await Promise.all([
        supabase
          .from('audit_log')
          .select('id, table_name, row_id, action, changed_by, changed_at, old_data, new_data')
          .order('changed_at', { ascending: false })
          .limit(200),
        supabase.from('profiles').select('id, full_name'),
      ]);
      if (logRes.error) {
        setErr(logRes.error.message);
        return;
      }
      setRows((logRes.data ?? []) as LogRow[]);
      setNames(
        new Map(
          ((profRes.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [
            p.id,
            p.full_name ?? 'İsimsiz',
          ]),
        ),
      );
    })();
  }, []);

  const visible = rows.filter((r) => filter === '' || r.table_name === filter);

  // Kayıttaki en anlamlı alanları kısa bir metne çevir
  const detail = (r: LogRow) => {
    const d = r.new_data ?? r.old_data ?? {};
    const labels: Record<string, string> = {
      place_name: 'Yer',
      status: 'Durum',
      amount: 'Tutar',
      reason: 'Sebep',
      category: 'Kategori',
      name: 'Ad',
    };
    return Object.keys(labels)
      .filter((k) => d[k] !== null && d[k] !== undefined && d[k] !== '')
      .map((k) => `${labels[k]}: ${String(d[k])}`)
      .join(' · ');
  };

  return (
    <section>
      <div className="row">
        <h3>İşlem geçmişi</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Tümü</option>
          {Object.entries(TABLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      {err && <p className="error">{err}</p>}

      <ul className="list">
        {visible.map((r) => (
          <li key={r.id} className="card">
            <div>
              <strong>{ACTION_LABELS[r.action]}</strong> · {TABLE_LABELS[r.table_name] ?? r.table_name}
            </div>
            <div className="muted small">
              {dateTr(r.changed_at)} · {r.changed_by ? names.get(r.changed_by) ?? 'Bilinmeyen' : 'Sistem'}
            </div>
            {detail(r) && <div className="small">{detail(r)}</div>}
          </li>
        ))}
        {visible.length === 0 && <p className="muted">Kayıt yok.</p>}
      </ul>
    </section>
  );
}
