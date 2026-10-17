import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Branch } from '../lib/types';
import { dateTr, money, parseAmount } from '../lib/format';

interface Expense {
  id: string;
  branch_id: string | null;
  amount: number;
  category: string;
  description: string | null;
  spent_on: string;
  receipt_path: string | null;
}

const CATEGORIES = ['Kira', 'Malzeme / baskı', 'Ulaşım', 'Kumbara yapımı', 'Diğer'];

interface Props {
  branches: Branch[];
  userId: string;
}

// Admin: harcama kaydı, fiş yükleme ve harcama listesi.
export function ExpenseManager({ branches, userId }: Props) {
  const [items, setItems] = useState<Expense[]>([]);
  const [branchId, setBranchId] = useState(''); // boş = genel merkez
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('id, branch_id, amount, category, description, spent_on, receipt_path')
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) setErr(error.message);
    else setItems((data ?? []) as Expense[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const n = parseAmount(amount);
    if (n === null || n <= 0) {
      setErr('Geçerli bir tutar girin.');
      return;
    }
    setBusy(true);

    let receiptPath: string | null = null;
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${spentOn.slice(0, 7)}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('receipts')
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) {
        setBusy(false);
        setErr('Fiş yüklenemedi: ' + upErr.message);
        return;
      }
      receiptPath = path;
    }

    const { error } = await supabase.from('expenses').insert({
      branch_id: branchId || null,
      amount: n,
      category,
      description: description.trim() || null,
      spent_on: spentOn,
      receipt_path: receiptPath,
      created_by: userId,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setAmount('');
    setDescription('');
    setFile(null);
    setFileKey((k) => k + 1);
    load();
  }

  async function openReceipt(path: string) {
    // Pencereyi önce açıp sonra adresini veriyoruz, tarayıcı engellemesin diye
    const win = window.open('', '_blank');
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 300);
    if (error || !data) {
      win?.close();
      setErr(error?.message ?? 'Fiş açılamadı.');
      return;
    }
    if (win) win.location.href = data.signedUrl;
  }

  async function remove(id: string) {
    if (!confirm('Bu harcama silinsin mi?')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) setErr(error.message);
    else load();
  }

  const branchName = (id: string | null) =>
    id === null ? 'Genel merkez' : branches.find((b) => b.id === id)?.name ?? '—';
  const total = items.reduce((s, x) => s + x.amount, 0);

  return (
    <section>
      <h3>Harcamalar</h3>

      <form className="card" onSubmit={add}>
        <div className="form-row">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Genel merkez</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            inputMode="decimal"
            placeholder="Tutar (₺)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} required />
        </div>
        <div className="form-row" style={{ marginTop: 8 }}>
          <input
            placeholder="Açıklama (isteğe bağlı)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            key={fileKey}
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Harcama ekle'}</button>
        </div>
        {err && <p className="error">{err}</p>}
      </form>

      <p className="muted small">Toplam harcama: <strong>{money(total)}</strong> ({items.length} kayıt)</p>

      <ul className="list">
        {items.map((x) => (
          <li key={x.id} className="card row">
            <div>
              <strong>{money(x.amount)}</strong> · {x.category}
              <div className="muted small">
                {dateTr(x.spent_on)} · {branchName(x.branch_id)}
                {x.description ? ` · ${x.description}` : ''}
              </div>
            </div>
            <div className="form-row">
              {x.receipt_path && (
                <button className="ghost" onClick={() => openReceipt(x.receipt_path!)}>Fişi gör</button>
              )}
              <button className="ghost" onClick={() => remove(x.id)}>Sil</button>
            </div>
          </li>
        ))}
        {items.length === 0 && <p className="muted">Henüz harcama kaydı yok.</p>}
      </ul>
    </section>
  );
}
