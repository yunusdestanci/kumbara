import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Box, Collection, Handover, Period } from '../lib/types';
import { dateTr, mapsUrl, money, monthName, parseAmount } from '../lib/format';
import { AddBoxForm } from '../components/AddBoxForm';
import { CollectionEntries } from '../components/CollectionEntries';
import { PasswordChange } from '../components/PasswordChange';
import './branch.css';

interface Props {
  branchId: string;
  userId: string;
}

type Tab = 'ozet' | 'kumbara' | 'teslim' | 'harcama' | 'hesap';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ozet', label: 'Ana sayfa' },
  { id: 'kumbara', label: 'Kumbaralarım' },
  { id: 'teslim', label: 'Para teslimi' },
  { id: 'harcama', label: 'Şube harcamaları' },
  { id: 'hesap', label: 'Şifre ve hesap' },
];

// Şube ekranı: RLS sayesinde sadece kendi şubesinin kumbara ve kayıtları gelir.
export function BranchPage({ branchId, userId }: Props) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [tab, setTab] = useState<Tab>('ozet');
  // Yan menünün açık/kapalı durumu
  const [menuOpen, setMenuOpen] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [period, setPeriod] = useState<Period | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [allCollectedTotal, setAllCollectedTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // null: henüz kontrol edilmedi, true: ilk girişte şifre değiştirilmeli
  const [mustChange, setMustChange] = useState<boolean | null>(null);
  // Veriler gelene kadar "dönem yok" uyarısını gösterme
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => setMustChange(data?.must_change_password ?? false));
  }, [userId]);

  const load = useCallback(async () => {
    setError(null);
    const [branchRes, periodRes, boxRes, hoRes, allColRes] = await Promise.all([
      supabase.from('branches').select('name').eq('id', branchId).single(),
      supabase.from('periods').select('*').eq('year', year).eq('month', month).maybeSingle(),
      supabase.from('boxes').select('*').eq('status', 'aktif').order('place_name'),
      supabase.from('handovers').select('*').order('handed_over_at', { ascending: false }),
      supabase.from('collections').select('amount').eq('status', 'toplandi'),
    ]);

    const firstErr = [branchRes, periodRes, boxRes, hoRes, allColRes].find((r) => r.error)?.error;
    if (firstErr) {
      setError(firstErr.message);
      return;
    }

    setBranchName(branchRes.data?.name ?? '');
    const p = (periodRes.data as Period | null) ?? null;
    setPeriod(p);
    setBoxes((boxRes.data ?? []) as Box[]);
    setHandovers((hoRes.data ?? []) as Handover[]);
    setAllCollectedTotal(
      ((allColRes.data ?? []) as { amount: number | null }[]).reduce((s, r) => s + (r.amount ?? 0), 0),
    );

    if (p) {
      const colRes = await supabase.from('collections').select('*').eq('period_id', p.id);
      if (colRes.error) {
        setError(colRes.error.message);
        return;
      }
      setCollections((colRes.data ?? []) as Collection[]);
    } else {
      setCollections([]);
    }
    setLoaded(true);
  }, [branchId, year, month]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="error">{error}</p>;

  if (mustChange === null) return <p className="muted">Yükleniyor…</p>;
  if (mustChange) {
    return <PasswordChange required onDone={() => setMustChange(false)} />;
  }

  const byBox = new Map(collections.map((c) => [c.box_id, c]));
  const collected = collections.filter((c) => c.status === 'toplandi');
  const missed = collections.filter((c) => c.status === 'toplanmadi');
  const collectedTotal = collected.reduce((s, c) => s + (c.amount ?? 0), 0);
  const pendingCount = boxes.length - collected.length - missed.length;
  // Bekleyen teslimler de bakiyeden düşülür, aynı parayı iki kez teslim edilemesin
  const handedAllTotal = handovers.reduce((s, h) => s + h.amount, 0);
  const remainingInBranch = allCollectedTotal - handedAllTotal;

  return (
    <div className="branch-page">
      <header className="branch-topbar">
        <strong>{TABS.find((t) => t.id === tab)?.label}</strong>
        <button className="branch-menu-btn" aria-label="Menüyü aç" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
      </header>

      {menuOpen && <div className="branch-backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`branch-drawer ${menuOpen ? 'open' : ''}`} aria-label="Şube menüsü">
        <div className="branch-drawer-title">{branchName || 'Şube'}</div>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            onClick={() => {
              setTab(t.id);
              setMenuOpen(false);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <h2>
        {branchName} · {monthName(month)} {year}
      </h2>

      {tab === 'ozet' && (
        <>
          {loaded && !period && (
            <div className="card warn">
              Bu ay için dönem henüz açılmamış. Merkez yönetici dönemi açtığında toplama girebilirsiniz.
            </div>
          )}

          <section className="stats">
            <Stat label="Bu ay toplanan" value={money(collectedTotal)} />
            <Stat label="Toplandı" value={`${collected.length} / ${boxes.length}`} />
            <Stat label="Toplanmadı" value={String(missed.length)} />
            <Stat label="Bekliyor" value={String(Math.max(pendingCount, 0))} />
            <Stat label="Teslim edilebilir bakiye" value={money(remainingInBranch)} />
          </section>

          {period && pendingCount > 0 && (
            <button className="branch-cta" onClick={() => setTab('kumbara')}>
              Bekleyen {pendingCount} kumbara için toplama gir
            </button>
          )}
        </>
      )}

      {tab === 'kumbara' && (
        <>
          <h3>Kumbaralar</h3>
          {loaded && !period && (
            <div className="card warn">Dönem açılmadan toplama girilemez.</div>
          )}
          <div className="list">
            {boxes.map((box) => (
              <BoxRow
                key={box.id}
                box={box}
                collection={byBox.get(box.id)}
                periodId={period?.id ?? null}
                userId={userId}
                onSaved={load}
              />
            ))}
            {boxes.length === 0 && <p className="muted">Bu şubeye atanmış aktif kumbara yok.</p>}
          </div>

          <AddBoxForm branchId={branchId} onAdded={load} />
        </>
      )}

      {tab === 'teslim' && (
        <HandoverSection
          branchId={branchId}
          periodId={period?.id ?? null}
          userId={userId}
          handovers={handovers}
          available={remainingInBranch}
          onSaved={load}
        />
      )}

      {tab === 'harcama' && <BranchExpenses branchId={branchId} />}

      {tab === 'hesap' && <PasswordChange required={false} onDone={() => {}} />}

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

interface BoxRowProps {
  box: Box;
  collection: Collection | undefined;
  periodId: string | null;
  userId: string;
  onSaved: () => void;
}

function BoxRow({ box, collection, periodId, userId, onSaved }: BoxRowProps) {
  const [mode, setMode] = useState<'toplandi' | 'toplanmadi' | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const status = collection?.status ?? 'bekliyor';
  const label = box.place_name || box.place_type;
  const statusText =
    status === 'toplandi'
      ? `Toplandı · ${money(collection?.amount ?? 0)}`
      : status === 'toplanmadi'
        ? `Toplanmadı · ${collection?.reason ?? ''}`
        : 'Bekliyor';

  async function save(kind: 'toplandi' | 'toplanmadi') {
    if (!periodId) return;
    setErr(null);

    let payload: Record<string, unknown>;
    if (kind === 'toplandi') {
      const n = parseAmount(amount);
      if (n === null) {
        setErr('Geçerli bir tutar girin.');
        return;
      }
      payload = {
        period_id: periodId,
        box_id: box.id,
        status: 'toplandi',
        // Aynı ay ikinci kez toplanırsa önceki tutarın üzerine eklenir
        amount: (collection?.status === 'toplandi' ? collection.amount ?? 0 : 0) + n,
        reason: null,
        collected_at: new Date().toISOString(),
        counted_by: userId,
      };
    } else {
      if (collection?.status === 'toplandi') {
        setErr('Bu kumbaradan bu ay zaten para toplandı. Toplanmadı olarak işaretlenemez.');
        return;
      }
      if (!reason.trim()) {
        setErr('Toplanmama sebebini yazın.');
        return;
      }
      payload = {
        period_id: periodId,
        box_id: box.id,
        status: 'toplanmadi',
        amount: null,
        reason: reason.trim(),
        collected_at: null,
        counted_by: userId,
      };
    }

    setBusy(true);
    const { error } = await supabase
      .from('collections')
      .upsert(payload, { onConflict: 'period_id,box_id' });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setMode(null);
    setAmount('');
    setReason('');
    onSaved();
  }

  return (
    <div className={`card box ${status}`}>
      <div className="box-head">
        <div>
          <strong>{label}</strong>
          {box.address && (
            <div className="muted small">
              {box.address} · <a href={mapsUrl(box.address)} target="_blank" rel="noreferrer">Haritada aç</a>
            </div>
          )}
        </div>
        <span className={`badge ${status}`}>{statusText}</span>
      </div>
      {collection?.status === 'toplandi' && (
        <CollectionEntries collectionId={collection.id} version={String(collection.amount)} />
      )}

      {periodId && mode === null && (
        <div className="actions">
          <button onClick={() => setMode('toplandi')}>{status === 'toplandi' ? 'Ekle' : 'Topla'}</button>
          <button className="ghost" onClick={() => setMode('toplanmadi')}>Toplanmadı</button>
        </div>
      )}

      {mode === 'toplandi' && (
        <div className="form-row">
          <input
            inputMode="decimal"
            placeholder="Tutar (₺)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
          <button disabled={busy} onClick={() => save('toplandi')}>Kaydet</button>
          <button className="ghost" onClick={() => setMode(null)}>İptal</button>
        </div>
      )}

      {mode === 'toplanmadi' && (
        <div className="form-row">
          <input
            placeholder="Sebep (dolu değil, kapalı, ulaşılamadı…)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
          <button disabled={busy} onClick={() => save('toplanmadi')}>Kaydet</button>
          <button className="ghost" onClick={() => setMode(null)}>İptal</button>
        </div>
      )}

      {err && <p className="error">{err}</p>}
    </div>
  );
}

interface HandoverProps {
  branchId: string;
  available: number;
  periodId: string | null;
  userId: string;
  handovers: Handover[];
  onSaved: () => void;
}

function HandoverSection({ branchId, periodId, userId, handovers, available, onSaved }: HandoverProps) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const n = parseAmount(amount);
    if (n === null || n <= 0) {
      setErr('Geçerli bir tutar girin.');
      return;
    }
    if (n > available) {
      setErr(`Bakiye yetersiz. Teslim edilebilir en fazla ${money(available)}.`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('handovers').insert({
      branch_id: branchId,
      period_id: periodId,
      amount: n,
      handed_by: userId,
      note: note.trim() || null,
      status: 'bekliyor',
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setAmount('');
    setNote('');
    onSaved();
  }

  return (
    <section>
      <h3>Merkeze teslim</h3>
      <p className="muted small">Teslim edilebilir bakiye: {money(available)}</p>
      <form className="card" onSubmit={submit}>
        <div className="form-row">
          <input
            inputMode="decimal"
            placeholder="Teslim edilen tutar (₺)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <input placeholder="Not (isteğe bağlı)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" disabled={busy}>Teslim kaydı aç</button>
        </div>
        {err && <p className="error">{err}</p>}
      </form>

      <ul className="list">
        {handovers.map((h) => (
          <li key={h.id} className="card row">
            <div>
              <strong>{money(h.amount)}</strong>
              <div className="muted small">
                {dateTr(h.handed_over_at)}
                {h.note ? ` · ${h.note}` : ''}
              </div>
            </div>
            <span className={`badge ${h.status}`}>
              {h.status === 'onaylandi' ? 'Onaylandı' : 'Onay bekliyor'}
            </span>
          </li>
        ))}
        {handovers.length === 0 && <p className="muted">Henüz teslim kaydı yok.</p>}
      </ul>
    </section>
  );
}

interface ExpenseRow {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  spent_on: string;
}

// Şube harcamaları salt okunur: yazma yetkisi yalnızca merkez yöneticide.
function BranchExpenses({ branchId }: { branchId: string }) {
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('expenses')
      .select('id,amount,category,description,spent_on')
      .eq('branch_id', branchId)
      .order('spent_on', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else setRows((data ?? []) as ExpenseRow[]);
      });
  }, [branchId]);

  if (err) return <p className="error">{err}</p>;
  if (!rows) return <p className="muted">Yükleniyor…</p>;

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <section>
      <h3>Harcamalar</h3>
      <p className="muted small">Harcama kayıtlarını merkez yönetici girer. Burada şubenizin harcamalarını görürsünüz.</p>
      <section className="stats">
        <Stat label="Toplam harcama" value={money(total)} />
        <Stat label="Kayıt sayısı" value={String(rows.length)} />
      </section>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id} className="card row">
            <div>
              <strong>{money(Number(r.amount))}</strong>
              <div className="muted small">
                {r.category} · {dateTr(r.spent_on)}
                {r.description ? ` · ${r.description}` : ''}
              </div>
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="muted">Henüz harcama kaydı yok.</p>}
      </ul>
    </section>
  );
}
