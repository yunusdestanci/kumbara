import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import type { Box, Branch, Handover, Period } from '../lib/types';
import { dateTr, money, monthName } from '../lib/format';
import { BoxManager } from '../components/BoxManager';
import { BranchManager } from '../components/BranchManager';
import { BranchUserForm } from '../components/BranchUserForm';
import { AdminCollect } from '../components/AdminCollect';
import { ExpenseManager } from '../components/ExpenseManager';
import { Reports } from '../components/Reports';
import { AuditLog } from '../components/AuditLog';
import './admin.css';

type Section = 'ana' | 'subeler' | 'kumbara' | 'toplama' | 'teslim' | 'harcama' | 'rapor' | 'gecmis';

const MENU: { key: Section; label: string }[] = [
  { key: 'ana', label: 'Ana sayfa' },
  { key: 'subeler', label: 'Şubeler' },
  { key: 'kumbara', label: 'Kumbaralar' },
  { key: 'toplama', label: 'Toplama girişi' },
  { key: 'teslim', label: 'Teslimler' },
  { key: 'harcama', label: 'Harcamalar' },
  { key: 'rapor', label: 'Raporlar' },
  { key: 'gecmis', label: 'İşlem geçmişi' },
];

interface CollRow {
  status: 'bekliyor' | 'toplandi' | 'toplanmadi';
  amount: number | null;
  box: { branch_id: string } | null;
}

interface Props {
  userId: string;
}

// Merkez yönetici paneli: sol menü + her bölüm kendi ekranında.
export function AdminPage({ userId }: Props) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [section, setSection] = useState<Section>('ana');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [boxes, setBoxes] = useState<Pick<Box, 'id' | 'branch_id' | 'status'>[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [allCollected, setAllCollected] = useState<CollRow[]>([]);
  const [periodRows, setPeriodRows] = useState<CollRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, b, bx, ho, ac] = await Promise.all([
        supabase.from('periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
        supabase.from('branches').select('*').order('name'),
        fetchAll<Pick<Box, 'id' | 'branch_id' | 'status'>>((a, z) =>
          supabase.from('boxes').select('id, branch_id, status').range(a, z),
        ),
        fetchAll<Handover>((a, z) =>
          supabase.from('handovers').select('*').order('handed_over_at', { ascending: false }).range(a, z),
        ),
        fetchAll<CollRow>((a, z) =>
          supabase.from('collections').select('status, amount, box:boxes!inner(branch_id)').eq('status', 'toplandi').range(a, z),
        ),
      ]);
      if (p.error) throw new Error(p.error.message);
      if (b.error) throw new Error(b.error.message);

      const ps = (p.data ?? []) as Period[];
      setPeriods(ps);
      setBranches((b.data ?? []) as Branch[]);
      setBoxes(bx);
      setHandovers(ho);
      setAllCollected(ac);
      setSelectedId((prev) => prev || ps[0]?.id || '');
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Seçili dönemin toplamaları
  const loadPeriodRows = useCallback(async () => {
    if (!selectedId) {
      setPeriodRows([]);
      return;
    }
    try {
      const rows = await fetchAll<CollRow>((a, z) =>
        supabase
          .from('collections')
          .select('status, amount, box:boxes!inner(branch_id)')
          .eq('period_id', selectedId)
          .range(a, z),
      );
      setPeriodRows(rows);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadPeriodRows();
  }, [loadPeriodRows]);

  const refresh = () => {
    load();
    loadPeriodRows();
  };

  const selected = periods.find((p) => p.id === selectedId) ?? null;
  const currentExists = periods.some((p) => p.year === year && p.month === month);

  async function openCurrentPeriod() {
    const { error } = await supabase.from('periods').insert({ year, month });
    if (error) setError(error.message);
    else refresh();
  }

  async function closePeriod(id: string) {
    // Kapatmadan önce girilmemiş kumbara var mı kontrol et
    const uncounted = summary.reduce((s, x) => s + x.notRecorded, 0);
    const warn = uncounted > 0 ? `Bu dönemde ${uncounted} kumbara için toplama girilmemiş. ` : '';
    if (!confirm(warn + 'Bu dönem kapatılsın mı? Kapanınca şubeler bu dönemde değişiklik yapamaz.')) return;
    const { error } = await supabase
      .from('periods')
      .update({ status: 'kapali', closed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) setError(error.message);
    else refresh();
  }

  async function approveHandover(id: string) {
    const { error } = await supabase
      .from('handovers')
      .update({ status: 'onaylandi', confirmed_by: userId, confirmed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) setError(error.message);
    else refresh();
  }

  // Dönem özetini Excel'de açılabilen CSV olarak indir
  function exportSummaryCsv() {
    if (!selected) return;
    const num = (n: number) => n.toFixed(2).replace('.', ',');
    const header = ['Şube', 'Kumbara', 'Toplandı', 'Toplanmadı', 'Girilmedi', 'Dönem toplamı', 'Şubede kalan', 'Onay bekleyen'];
    const lines = summary.map((s) => [
      s.branch.name,
      s.activeBoxes,
      s.collectedCount,
      s.missedCount,
      s.notRecorded,
      num(s.periodTotal),
      num(s.remaining),
      num(s.pending),
    ]);
    const csv = [header, ...lines]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kumbara-${selected.year}-${String(selected.month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Şube başına özet
  const summary = branches.map((br) => {
    const activeBoxes = boxes.filter((b) => b.branch_id === br.id && b.status === 'aktif').length;
    const rowsOfBranch = periodRows.filter((r) => r.box?.branch_id === br.id);
    const collected = rowsOfBranch.filter((r) => r.status === 'toplandi');
    const missed = rowsOfBranch.filter((r) => r.status === 'toplanmadi');
    const periodTotal = collected.reduce((s, r) => s + (r.amount ?? 0), 0);
    const notRecorded = Math.max(activeBoxes - collected.length - missed.length, 0);

    const collectedAll = allCollected
      .filter((r) => r.box?.branch_id === br.id)
      .reduce((s, r) => s + (r.amount ?? 0), 0);
    const approved = handovers
      .filter((h) => h.branch_id === br.id && h.status === 'onaylandi')
      .reduce((s, h) => s + h.amount, 0);
    const pending = handovers
      .filter((h) => h.branch_id === br.id && h.status === 'bekliyor')
      .reduce((s, h) => s + h.amount, 0);

    return {
      branch: br,
      activeBoxes,
      collectedCount: collected.length,
      missedCount: missed.length,
      notRecorded,
      periodTotal,
      remaining: collectedAll - approved,
      pending,
    };
  });

  const totals = summary.reduce(
    (t, s) => ({
      activeBoxes: t.activeBoxes + s.activeBoxes,
      collectedCount: t.collectedCount + s.collectedCount,
      missedCount: t.missedCount + s.missedCount,
      notRecorded: t.notRecorded + s.notRecorded,
      periodTotal: t.periodTotal + s.periodTotal,
      remaining: t.remaining + s.remaining,
      pending: t.pending + s.pending,
    }),
    { activeBoxes: 0, collectedCount: 0, missedCount: 0, notRecorded: 0, periodTotal: 0, remaining: 0, pending: 0 },
  );

  const pendingHandovers = handovers.filter((h) => h.status === 'bekliyor');
  const pendingTotal = pendingHandovers.reduce((s, h) => s + h.amount, 0);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const title = MENU.find((m) => m.key === section)?.label ?? '';

  // ---------- BÖLÜMLER ----------
  let content: React.ReactNode;

  if (section === 'ana') {
    content = (
      <>
        <div className="alert-grid">
          {loaded && !currentExists && (
            <div className="alert">
              <strong>Bu ay açılmamış</strong>
              Şubeler bu ay toplama giremez.
              <div style={{ marginTop: 8 }}>
                <button onClick={openCurrentPeriod}>Bu ayı aç</button>
              </div>
            </div>
          )}
          {pendingHandovers.length > 0 && (
            <div className="alert info">
              <strong>{pendingHandovers.length} teslim onay bekliyor</strong>
              Toplam {money(pendingTotal)}
              <div style={{ marginTop: 8 }}>
                <button className="ghost" onClick={() => setSection('teslim')}>Teslimlere git</button>
              </div>
            </div>
          )}
          {selected?.status === 'acik' && totals.notRecorded > 0 && (
            <div className="alert">
              <strong>{totals.notRecorded} kumbara girilmedi</strong>
              Bu dönemde bazı kumbaralar için toplama girilmemiş.
              <div style={{ marginTop: 8 }}>
                <button className="ghost" onClick={() => setSection('toplama')}>Toplama girişine git</button>
              </div>
            </div>
          )}
        </div>

        <section className="stats">
          <Stat label="Dönem toplamı" value={money(totals.periodTotal)} />
          <Stat label="Toplandı" value={`${totals.collectedCount} / ${totals.activeBoxes}`} />
          <Stat label="Toplanmadı" value={String(totals.missedCount)} />
          <Stat label="Girilmedi" value={String(totals.notRecorded)} />
          <Stat label="Şubelerde kalan" value={money(totals.remaining)} />
          <Stat label="Onay bekleyen teslim" value={money(totals.pending)} />
        </section>

        <h3>Şubeler</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Şube</th>
                <th>Kumbara</th>
                <th>Toplandı</th>
                <th>Toplanmadı</th>
                <th>Girilmedi</th>
                <th>Dönem toplamı</th>
                <th>Şubede kalan</th>
                <th>Onay bekleyen</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.branch.id}>
                  <td>{s.branch.name}</td>
                  <td>{s.activeBoxes}</td>
                  <td>{s.collectedCount}</td>
                  <td>{s.missedCount}</td>
                  <td>{s.notRecorded}</td>
                  <td>{money(s.periodTotal)}</td>
                  <td>{money(s.remaining)}</td>
                  <td>{s.pending > 0 ? money(s.pending) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else if (section === 'subeler') {
    content = (
      <>
        <BranchManager branches={branches} onChanged={refresh} />
        <BranchUserForm branches={branches} />
      </>
    );
  } else if (section === 'kumbara') {
    content = <BoxManager branches={branches} onChanged={refresh} />;
  } else if (section === 'toplama') {
    content = <AdminCollect branches={branches} period={selected} userId={userId} onChanged={refresh} />;
  } else if (section === 'teslim') {
    content = (
      <ul className="list">
        {handovers.map((h) => (
          <li key={h.id} className="card row">
            <div>
              <strong>{branchName(h.branch_id)}</strong> · {money(h.amount)}
              <div className="muted small">
                {dateTr(h.handed_over_at)}
                {h.note ? ` · ${h.note}` : ''}
              </div>
            </div>
            {h.status === 'bekliyor' ? (
              <button onClick={() => approveHandover(h.id)}>Teslim alındı, onayla</button>
            ) : (
              <span className="badge onaylandi">Onaylandı</span>
            )}
          </li>
        ))}
        {handovers.length === 0 && <p className="muted">Henüz teslim kaydı yok.</p>}
      </ul>
    );
  } else if (section === 'harcama') {
    content = <ExpenseManager branches={branches} userId={userId} />;
  } else if (section === 'rapor') {
    content = <Reports branches={branches} />;
  } else {
    content = <AuditLog />;
  }

  return (
    <div className="admin-shell">
      <nav className="admin-nav">
        <div className="brand">Kumbara · Merkez</div>
        {MENU.map((m) => (
          <button
            key={m.key}
            className={`admin-nav-item ${section === m.key ? 'active' : ''}`}
            onClick={() => setSection(m.key)}
          >
            {m.label}
            {m.key === 'teslim' && pendingHandovers.length > 0 && (
              <span className="count">{pendingHandovers.length}</span>
            )}
          </button>
        ))}
        <button className="admin-nav-item logout" onClick={() => supabase.auth.signOut()}>
          Çıkış yap
        </button>
      </nav>

      <main className="admin-main">
        <header className="admin-top">
          <h2>{title}</h2>
          <div className="admin-periodbar">
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {monthName(p.month)} {p.year} {p.status === 'kapali' ? '(kapalı)' : ''}
                </option>
              ))}
            </select>
            {selected?.status === 'acik' && (
              <button className="ghost" onClick={() => closePeriod(selected.id)}>Dönemi kapat</button>
            )}
            {selected && (
              <button className="ghost" onClick={exportSummaryCsv}>CSV indir</button>
            )}
            {loaded && !currentExists && <button onClick={openCurrentPeriod}>Bu ayı aç</button>}
          </div>
        </header>

        {error && <p className="error">{error}</p>}
        {periods.length === 0 && loaded && (
          <div className="card warn">Henüz dönem yok. "Bu ayı aç" ile başlayın.</div>
        )}

        {content}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
