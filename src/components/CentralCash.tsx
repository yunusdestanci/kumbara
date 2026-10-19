import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { dateTr, money, parseAmount } from '../lib/format';

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

interface IncomeRow {
  id: string;
  amount: number;
  received_on: string;
  source: string;
  description: string | null;
}

interface Movement {
  date: string; // YYYY-MM-DD
  kind: 'giris' | 'cikis';
  text: string;
  amount: number;
}

const SOURCES = ['Bağış', 'Banka transferi', 'Diğer'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Merkez kasa: onaylanan şube teslimleri ve dış girişler giriş, genel merkez harcamaları çıkış.
export function CentralCash() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return iso(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [to, setTo] = useState(() => iso(new Date()));
  const [handovers, setHandovers] = useState<HandoverRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [incomes, setIncomes] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Giriş formu
  const [amount, setAmount] = useState('');
  const [receivedOn, setReceivedOn] = useState(() => iso(new Date()));
  const [source, setSource] = useState(SOURCES[0]);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [h, e, i] = await Promise.all([
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
        fetchAll<IncomeRow>((a, b) =>
          supabase
            .from('central_incomes')
            .select('id,amount,received_on,source,description')
            .order('received_on', { ascending: true })
            .range(a, b),
        ),
      ]);
      setHandovers(h);
      setExpenses(e);
      setIncomes(i);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    for (const i of incomes) {
      moves.push({
        date: i.received_on,
        kind: 'giris',
        text: `${i.source}${i.description ? ` · ${i.description}` : ''}`,
        amount: Number(i.amount),
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
  }, [handovers, expenses, incomes, from, to]);

  async function addIncome(e: FormEvent) {
    e.preventDefault();
    setFormErr(null);
    const n = parseAmount(amount);
    if (n === null || n <= 0) {
      setFormErr('Geçerli bir tutar girin.');
      return;
    }
    if (!source) {
      setFormErr('Kaynak seçin.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('central_incomes').insert({
      amount: n,
      received_on: receivedOn,
      source,
      description: description.trim() || null,
    });
    setBusy(false);
    if (error) {
      setFormErr(error.message);
      return;
    }
    setAmount('');
    setDescription('');
    load();
  }

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
        Giriş: onaylanan şube teslimleri ve dış girişler. Çıkış: genel merkez harcamaları.
      </p>

      <form className="card" onSubmit={addIncome}>
        <strong>Kasaya dış giriş ekle</strong>
        <div className="form-row">
          <input
            inputMode="decimal"
            placeholder="Tutar (₺)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} required />
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            placeholder="Açıklama (isteğe bağlı)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button type="submit" disabled={busy}>Kaydet</button>
        </div>
        {formErr && <p className="error">{formErr}</p>}
      </form>

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
