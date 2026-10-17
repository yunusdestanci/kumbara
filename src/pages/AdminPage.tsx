import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Box, Branch, Handover, Period } from '../lib/types';
import { dateTr, money, monthName } from '../lib/format';
import { BoxManager } from '../components/BoxManager';
import { BranchManager } from '../components/BranchManager';
import { BranchUserForm } from '../components/BranchUserForm';
import { AdminCollect } from '../components/AdminCollect';
import { ExpenseManager } from '../components/ExpenseManager';
import { AuditLog } from '../components/AuditLog';

// Tüm kumbara kayıtları (şube adıyla birlikte, tek sorguda).
interface CollRow {
  period_id: string;
  box_id: string;
  status: 'bekliyor' | 'toplandi' | 'toplanmadi';
  amount: number | null;
  box: { branch_id: string } | null;
}

interface Props {
  userId: string;
}

// Admin ekranı: tüm şubeler, dönem özeti ve teslim onayı.
export function AdminPage({ userId }: Props) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [periods, setPeriods] = useState<Period[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [boxes, setBoxes] = useState<Pick<Box, 'id' | 'branch_id' | 'status'>[]>([]);
  const [rows, setRows] = useState<CollRow[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [p, b, bx, c, h] = await Promise.all([
      supabase.from('periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
      supabase.from('branches').select('*').order('name'),
      supabase.from('boxes').select('id, branch_id, status'),
      supabase.from('collections').select('period_id, box_id, status, amount, box:boxes(branch_id)'),
      supabase.from('handovers').select('*').order('handed_over_at', { ascending: false }),
    ]);

    const firstErr = [p, b, bx, c, h].find((r) => r.error)?.error;
    if (firstErr) {
      setError(firstErr.message);
      return;
    }

    const ps = (p.data ?? []) as Period[];
    setPeriods(ps);
    setBranches((b.data ?? []) as Branch[]);
    setBoxes((bx.data ?? []) as Pick<Box, 'id' | 'branch_id' | 'status'>[]);
    setRows((c.data ?? []) as unknown as CollRow[]);
    setHandovers((h.data ?? []) as Handover[]);
    setSelectedId((prev) => prev || ps[0]?.id || '');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="error">{error}</p>;

  const selected = periods.find((p) => p.id === selectedId) ?? null;
  const currentExists = periods.some((p) => p.year === year && p.month === month);

  async function openCurrentPeriod() {
    const { error } = await supabase.from('periods').insert({ year, month });
    if (error) setError(error.message);
    else load();
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
    else load();
  }

  async function approveHandover(id: string) {
    const { error } = await supabase
      .from('handovers')
      .update({ status: 'onaylandi', confirmed_by: userId, confirmed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) setError(error.message);
    else load();
  }

  // Şube başına özet
  const summary = branches.map((br) => {
    const activeBoxes = boxes.filter((b) => b.branch_id === br.id && b.status === 'aktif').length;
    const periodRows = rows.filter((r) => r.period_id === selectedId && r.box?.branch_id === br.id);
    const collected = periodRows.filter((r) => r.status === 'toplandi');
    const missed = periodRows.filter((r) => r.status === 'toplanmadi');
    const periodTotal = collected.reduce((s, r) => s + (r.amount ?? 0), 0);
    const notRecorded = Math.max(activeBoxes - collected.length - missed.length, 0);

    const allCollected = rows
      .filter((r) => r.box?.branch_id === br.id && r.status === 'toplandi')
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
      remaining: allCollected - approved,
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

  // Dönem özetini Excel'de açılabilen CSV olarak indir (noktalı virgül ayraçlı, Türkçe karakter uyumlu)
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

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

  return (
    <>
      <div className="row">
        <h2>Merkez özeti</h2>
        <div className="form-row">
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
          {selected && <button className="ghost" onClick={exportSummaryCsv}>CSV indir</button>}
          {!currentExists && <button onClick={openCurrentPeriod}>Bu ayı aç</button>}
        </div>
      </div>

      {periods.length === 0 && (
        <div className="card warn">Henüz dönem yok. "Bu ayı aç" ile başlayın.</div>
      )}

      <section className="stats">
        <Stat label="Dönem toplamı" value={money(totals.periodTotal)} />
        <Stat label="Toplandı" value={`${totals.collectedCount} / ${totals.activeBoxes}`} />
        <Stat label="Toplanmadı" value={String(totals.missedCount)} />
        <Stat label="Girilmedi" value={String(totals.notRecorded)} />
        <Stat label="Şubelerde kalan" value={money(totals.remaining)} />
        <Stat label="Onay bekleyen teslim" value={money(totals.pending)} />
      </section>

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

      <BranchManager branches={branches} onChanged={load} />
      <BranchUserForm branches={branches} />

      <AdminCollect branches={branches} period={selected} userId={userId} onChanged={load} />

      <ExpenseManager branches={branches} userId={userId} />

      <AuditLog />

      <BoxManager branches={branches} onChanged={load} />

      <h3>Teslim kayıtları</h3>
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
    </>
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
