import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Branch, Period } from '../lib/types';
import { money, monthName } from '../lib/format';

// ---- Veri tipleri ----
interface BoxRow {
  id: string;
  branch_id: string;
  status: string;
}
interface CollRow {
  period_id: string;
  status: 'bekliyor' | 'toplandi' | 'toplanmadi';
  amount: number | null;
  reason: string | null;
  box: { branch_id: string } | null;
}
interface HandRow {
  branch_id: string;
  period_id: string | null;
  amount: number;
  status: 'bekliyor' | 'onaylandi';
}
interface ExpRow {
  branch_id: string | null;
  amount: number;
  category: string;
  spent_on: string;
}

// Supabase tek seferde en fazla 1000 satır döndürür; hepsini sayfa sayfa çeker.
async function fetchAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await run(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: '#e5e7eb', borderRadius: 4, height: 10, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, background: '#1f6f4a', height: '100%' }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

interface Props {
  branches: Branch[];
  // Ana sayfada gömülü kullanım: sekme ve dönem seçimi gizlenir, dışarıdan gelen dönem kullanılır
  embedded?: boolean;
  periodId?: string;
}

// Admin: aylık merkez raporu ve şube bazlı 12 aylık rapor.
export function Reports({ branches, embedded = false, periodId: presetPeriodId }: Props) {
  const [mode, setMode] = useState<'ay' | 'sube'>('ay');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [boxes, setBoxes] = useState<BoxRow[]>([]);
  const [handovers, setHandovers] = useState<HandRow[]>([]);
  const [expenses, setExpenses] = useState<ExpRow[]>([]);
  const [monthColls, setMonthColls] = useState<CollRow[]>([]);
  const [branchColls, setBranchColls] = useState<CollRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Dışarıdan dönem gelirse (ana sayfa) onu kullan
  useEffect(() => {
    if (presetPeriodId) setPeriodId(presetPeriodId);
  }, [presetPeriodId]);

  // Genel veriler: dönemler, kumbaralar, teslimler, harcamalar
  useEffect(() => {
    (async () => {
      try {
        const [ps, bx, ho, ex] = await Promise.all([
          supabase.from('periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
          fetchAll<BoxRow>((a, b) => supabase.from('boxes').select('id, branch_id, status').range(a, b)),
          fetchAll<HandRow>((a, b) => supabase.from('handovers').select('branch_id, period_id, amount, status').range(a, b)),
          fetchAll<ExpRow>((a, b) => supabase.from('expenses').select('branch_id, amount, category, spent_on').range(a, b)),
        ]);
        if (ps.error) throw new Error(ps.error.message);
        const list = (ps.data ?? []) as Period[];
        setPeriods(list);
        setPeriodId((prev) => prev || list[0]?.id || '');
        setBoxes(bx);
        setHandovers(ho);
        setExpenses(ex);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Seçili ayın toplamaları
  useEffect(() => {
    if (!periodId) return;
    fetchAll<CollRow>((a, b) =>
      supabase
        .from('collections')
        .select('period_id, status, amount, reason, box:boxes!inner(branch_id)')
        .eq('period_id', periodId)
        .range(a, b),
    )
      .then(setMonthColls)
      .catch((e) => setErr((e as Error).message));
  }, [periodId]);

  // Varsayılan şube
  useEffect(() => {
    if (!branchId && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);

  // Seçili şubenin tüm toplamaları
  useEffect(() => {
    if (!branchId) return;
    fetchAll<CollRow>((a, b) =>
      supabase
        .from('collections')
        .select('period_id, status, amount, reason, box:boxes!inner(branch_id)')
        .eq('box.branch_id', branchId)
        .range(a, b),
    )
      .then(setBranchColls)
      .catch((e) => setErr((e as Error).message));
  }, [branchId]);

  if (loading) return <p className="muted">Rapor hazırlanıyor…</p>;
  if (err) return <p className="error">{err}</p>;

  const switcher = embedded ? null : (
    <div className="form-row" style={{ marginBottom: 12 }}>
      <button className={mode === 'ay' ? '' : 'ghost'} onClick={() => setMode('ay')}>Ay raporu</button>
      <button className={mode === 'sube' ? '' : 'ghost'} onClick={() => setMode('sube')}>Şube raporu</button>
    </div>
  );

  // ---------- AY RAPORU ----------
  if (mode === 'ay') {
    const p = periods.find((x) => x.id === periodId);
    const activeBoxes = boxes.filter((b) => b.status === 'aktif');
    const collected = monthColls.filter((c) => c.status === 'toplandi');
    const missed = monthColls.filter((c) => c.status === 'toplanmadi');
    const collectedTotal = collected.reduce((s, c) => s + (c.amount ?? 0), 0);
    const notRecorded = Math.max(activeBoxes.length - collected.length - missed.length, 0);

    const hoMonth = handovers.filter((h) => h.period_id === periodId);
    const handedTotal = hoMonth.reduce((s, h) => s + h.amount, 0);
    const approvedTotal = hoMonth.filter((h) => h.status === 'onaylandi').reduce((s, h) => s + h.amount, 0);

    const start = p ? `${p.year}-${pad(p.month)}-01` : '';
    const end = p ? `${p.year}-${pad(p.month)}-${pad(new Date(p.year, p.month, 0).getDate())}` : '';
    const monthExp = expenses.filter((e) => e.spent_on >= start && e.spent_on <= end);
    const expTotal = monthExp.reduce((s, e) => s + e.amount, 0);
    const byCategory = new Map<string, number>();
    monthExp.forEach((e) => byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount));
    const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

    const reasons = new Map<string, number>();
    missed.forEach((c) => {
      const r = (c.reason ?? 'Belirtilmedi').trim();
      reasons.set(r, (reasons.get(r) ?? 0) + 1);
    });
    const topReasons = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    const rows = branches
      .map((br) => {
        const active = activeBoxes.filter((b) => b.branch_id === br.id).length;
        const bc = collected.filter((c) => c.box?.branch_id === br.id);
        const bm = missed.filter((c) => c.box?.branch_id === br.id);
        return {
          id: br.id,
          name: br.name,
          active,
          collected: bc.length,
          missed: bm.length,
          notRec: Math.max(active - bc.length - bm.length, 0),
          total: bc.reduce((s, c) => s + (c.amount ?? 0), 0),
          handed: hoMonth.filter((h) => h.branch_id === br.id).reduce((s, h) => s + h.amount, 0),
        };
      })
      .sort((a, b) => b.total - a.total);
    const maxTotal = Math.max(...rows.map((r) => r.total), 0);

    return (
      <>
        {switcher}
        {!embedded && <div className="form-row" style={{ marginBottom: 12 }}>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((x) => (
              <option key={x.id} value={x.id}>
                {monthName(x.month)} {x.year} {x.status === 'kapali' ? '(kapalı)' : ''}
              </option>
            ))}
          </select>
        </div>}

        {!p && <p className="muted">Henüz dönem yok.</p>}

        {p && (
          <>
            <section className="stats">
              <Stat label="Toplanan" value={money(collectedTotal)} />
              <Stat label="Toplandı" value={`${collected.length} / ${activeBoxes.length}`} />
              <Stat label="Toplanmadı" value={String(missed.length)} />
              <Stat label="Girilmedi" value={String(notRecorded)} />
              <Stat label="Merkeze teslim" value={money(handedTotal)} />
              <Stat label="Onaylanan teslim" value={money(approvedTotal)} />
              <Stat label="Merkez harcaması (bu ay)" value={money(expTotal)} />
            </section>

            <h3>Şubelere göre toplama</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Şube</th>
                    <th>Toplanan</th>
                    <th>Toplandı</th>
                    <th>Toplanmadı</th>
                    <th>Girilmedi</th>
                    <th>Teslim</th>
                    <th style={{ minWidth: 120 }}>Oran</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{money(r.total)}</td>
                      <td>{r.collected} / {r.active}</td>
                      <td>{r.missed}</td>
                      <td>{r.notRec}</td>
                      <td>{money(r.handed)}</td>
                      <td><Bar value={r.total} max={maxTotal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row" style={{ alignItems: 'flex-start', gap: 16, marginTop: 16 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <h3>Toplanmama sebepleri</h3>
                {topReasons.length === 0 && <p className="muted">Bu ay toplanmayan kumbara yok.</p>}
                <ul className="list">
                  {topReasons.map(([r, n]) => (
                    <li key={r} className="small">{r} · <strong>{n}</strong></li>
                  ))}
                </ul>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <h3>Harcama kategorileri</h3>
                {categories.length === 0 && <p className="muted">Bu ay harcama kaydı yok.</p>}
                <ul className="list">
                  {categories.map(([c, v]) => (
                    <li key={c} className="small">{c} · <strong>{money(v)}</strong></li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  // ---------- ŞUBE RAPORU ----------
  const branch = branches.find((b) => b.id === branchId);
  const activeCount = boxes.filter((b) => b.branch_id === branchId && b.status === 'aktif').length;
  const allCollected = branchColls
    .filter((c) => c.status === 'toplandi')
    .reduce((s, c) => s + (c.amount ?? 0), 0);
  const approved = handovers
    .filter((h) => h.branch_id === branchId && h.status === 'onaylandi')
    .reduce((s, h) => s + h.amount, 0);

  const last12 = periods.slice(0, 12).reverse();
  const monthRows = last12.map((p) => {
    const cs = branchColls.filter((c) => c.period_id === p.id);
    const col = cs.filter((c) => c.status === 'toplandi');
    const mis = cs.filter((c) => c.status === 'toplanmadi');
    return {
      p,
      collected: col.length,
      missed: mis.length,
      total: col.reduce((s, c) => s + (c.amount ?? 0), 0),
      handed: handovers
        .filter((h) => h.branch_id === branchId && h.period_id === p.id)
        .reduce((s, h) => s + h.amount, 0),
    };
  });
  const maxMonth = Math.max(...monthRows.map((r) => r.total), 0);

  return (
    <>
      {switcher}
      <div className="form-row" style={{ marginBottom: 12 }}>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {branch && (
        <>
          <section className="stats">
            <Stat label="Aktif kumbara" value={String(activeCount)} />
            <Stat label="Tüm zamanlar toplam" value={money(allCollected)} />
            <Stat label="Onaylanan teslim" value={money(approved)} />
            <Stat label="Şubede kalan" value={money(allCollected - approved)} />
          </section>

          <h3>Son 12 ay</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dönem</th>
                  <th>Toplanan</th>
                  <th>Toplandı</th>
                  <th>Toplanmadı</th>
                  <th>Teslim</th>
                  <th style={{ minWidth: 120 }}>Grafik</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map((r) => (
                  <tr key={r.p.id}>
                    <td>{monthName(r.p.month)} {r.p.year}</td>
                    <td>{money(r.total)}</td>
                    <td>{r.collected}</td>
                    <td>{r.missed}</td>
                    <td>{money(r.handed)}</td>
                    <td><Bar value={r.total} max={maxMonth} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {monthRows.length === 0 && <p className="muted">Henüz dönem yok.</p>}
        </>
      )}
    </>
  );
}
