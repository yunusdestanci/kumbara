import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { dateTr, money } from '../lib/format';

interface HandoverRow {
  id: string;
  amount: number;
  confirmed_at: string | null;
  note: string | null;
  branch: { name: string } | { name: string }[] | null;
}

interface ExpenseRow {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  spent_on: string;
}

interface Movement {
  date: string; // YYYY-MM-DD
  kind: 'giris' | 'cikis';
  text: string;
  amount: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Merkez kasa: onaylanan şube teslimleri giriş, genel merkez harcamaları çıkış.
export function CentralCash() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return iso(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [to, setTo] = useState(() => iso(new Date()));
  const [handovers, setHandovers] = useState<HandoverRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAll<HandoverRow>((a, b) =>
        supabase
          .from('handovers')
          .select('id,amount,confirmed_at,note,branch:branches(name)')
          .eq('status', 'onaylandi')
          .order('confirmed_at', { ascending: true })
          .range(a, b),
      ),
      fetchAll<ExpenseRow>((a, b) =>
        supabase
          .from('expenses')
          .select('id,amount,category,description,spent_on')
          .is('branch_id', null)
          .order('spent_on', { ascending: true })
          .range(a, b),
      ),
    ])
      .then(([h, e]) => {
        if (cancelled) return;
        setHandovers(h);
        setExpenses(e);
      })
      .catch((x: Error) => {
        if (!cancelled) setErr(x.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statement = useMemo(() => {
    const moves: Movement[] = [];
    for (const h of handovers) {
      if (!h.confirmed_at) continue;
      const branchName = Array.isArray(h.branch) ? h.branch[0]?.name : h.branch?.name;
      moves.push({
        date: h.confirmed_at.slice(0, 10),
        kind: 'giris',
        text: `${branchName ?? 'Şube'} teslimi${h.note ? ` · ${h.note}` : ''}`,
        amount: Number(h.amount),
      });
    }
    for (const e of expenses) {
      moves.push({
        date: e.spent_on,
        kind: 'cikis',
        text: `${e.category}${e.description ? ` · ${e.description}` : ''}`,
        amount: Number(e.amount),
      });
    }
    moves.sort((a, b) => a.date.localeCompare(b.date));

    // Başlangıç tarihinden önceki hareketler devir bakiyesini oluşturur
    let opening = 0;
    for (const m of moves) {
      if (m.date < from) opening += m.kind === 'giris' ? m.amount : -m.amount;
    }

    const rows: (Movement & { balance: number })[] = [];
    let running = opening;
    let totalIn = 0;
    let totalOut = 0;
    for (const m of moves) {
      if (m.date < from || m.date > to) continue;
      if (m.kind === 'giris') {
        running += m.amount;
        totalIn += m.amount;
      } else {
        running -= m.amount;
        totalOut += m.amount;
      }
      rows.push({ ...m, balance: running });
    }

    return { opening, rows, totalIn, totalOut, closing: running };
  }, [handovers, expenses, from, to]);

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const num = (n: number) => n.toFixed(2).replace('.', ',');
    const lines = [
      ['Tarih', 'Tür', 'Açıklama', 'Giriş', 'Çıkış', 'Bakiye'].join(';'),
      [esc(from), esc('Devir'), esc(''), '', '', num(statement.opening)].join(';'),
      ...statement.rows.map((r) =>
        [
          esc(r.date),
          esc(r.kind === 'giris' ? 'Giriş' : 'Çıkış'),
          esc(r.text),
          r.kind === 'giris' ? num(r.amount) : '',
          r.kind === 'cikis' ? num(r.amount) : '',
          num(r.balance),
        ].join(';'),
      ),
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merkez-kasa-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h3>Merkez kasa ekstresi</h3>
      <p className="muted small">
        Giriş: merkez yöneticinin onayladığı şube teslimleri. Çıkış: genel merkez harcamaları.
      </p>

      <div className="form-row">
        <label>
          Başlangıç
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Bitiş
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="ghost" onClick={exportCsv} disabled={loading || !!err}>
          CSV indir
        </button>
      </div>

      {err && <p className="error">{err}</p>}
      {loading && <p className="muted">Yükleniyor…</p>}

      {!loading && !err && (
        <>
          <section className="stats">
            <Cell label="Devir" value={money(statement.opening)} />
            <Cell label="Giriş" value={money(statement.totalIn)} />
            <Cell label="Çıkış" value={money(statement.totalOut)} />
            <Cell label="Kasa bakiyesi" value={money(statement.closing)} />
          </section>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Açıklama</th>
                  <th>Giriş</th>
                  <th>Çıkış</th>
                  <th>Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {statement.rows.map((r, i) => (
                  <tr key={`${r.date}-${i}`}>
                    <td>{dateTr(r.date)}</td>
                    <td>{r.text}</td>
                    <td>{r.kind === 'giris' ? money(r.amount) : ''}</td>
                    <td>{r.kind === 'cikis' ? money(r.amount) : ''}</td>
                    <td>{money(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {statement.rows.length === 0 && (
            <p className="muted">Bu tarih aralığında hareket yok.</p>
          )}
        </>
      )}
    </section>
  );
}

function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
