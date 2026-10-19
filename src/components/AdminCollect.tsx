import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Box, Branch, Collection, Period } from '../lib/types';
import { mapsUrl, money, parseAmount } from '../lib/format';

interface Props {
  branches: Branch[];
  period: Period | null;
  userId: string;
  onChanged: () => void;
}

// Admin: şubenin toplamasını şube adına girer (şube veri girmediğinde kullanılır).
export function AdminCollect({ branches, period, userId, onChanged }: Props) {
  const [branchId, setBranchId] = useState('');
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [cols, setCols] = useState<Collection[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const load = useCallback(async () => {
    if (!branchId) return;
    const bx = await supabase
      .from('boxes')
      .select('*')
      .eq('branch_id', branchId)
      .eq('status', 'aktif')
      .order('place_name');
    if (bx.error) {
      setErr(bx.error.message);
      return;
    }
    setBoxes((bx.data ?? []) as Box[]);

    if (period) {
      const c = await supabase.from('collections').select('*').eq('period_id', period.id);
      if (c.error) {
        setErr(c.error.message);
        return;
      }
      setCols((c.data ?? []) as Collection[]);
    } else {
      setCols([]);
    }
  }, [branchId, period]);

  useEffect(() => {
    load();
  }, [load]);

  const byBox = new Map(cols.map((c) => [c.box_id, c]));

  return (
    <section>
      <h3>Toplama durumu</h3>
      <p className="muted small">Toplamayı şube hesabı girer. Yönetici burada sadece görür, değişiklik yapamaz.</p>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        {!period && <span className="muted small">Önce yukarıdan bir dönem seçin.</span>}
      </div>
      {err && <p className="error">{err}</p>}

      <ul className="list">
        {boxes.map((box) => (
          <AdminCollectRow
            key={box.id}
            box={box}
            collection={byBox.get(box.id)}
            periodId={null}
            userId={userId}
            onSaved={() => {
              load();
              onChanged();
            }}
          />
        ))}
        {boxes.length === 0 && <p className="muted">Bu şubede aktif kumbara yok.</p>}
      </ul>
    </section>
  );
}

interface RowProps {
  box: Box;
  collection: Collection | undefined;
  periodId: string | null;
  userId: string;
  onSaved: () => void;
}

function AdminCollectRow({ box, collection, periodId, userId, onSaved }: RowProps) {
  const [mode, setMode] = useState<'toplandi' | 'toplanmadi' | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const status = collection?.status ?? 'bekliyor';
  const label = box.place_name || box.address || 'Kumbara';
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
    const { error } = await supabase.from('collections').upsert(payload, { onConflict: 'period_id,box_id' });
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
    <li className={`card box ${status}`}>
      <div className="box-head">
        <div>
          <strong>{label}</strong>
          {box.place_name && box.address && (
            <div className="muted small">
              {box.address} · <a href={mapsUrl(box.address)} target="_blank" rel="noreferrer">Haritada aç</a>
            </div>
          )}
        </div>
        <span className={`badge ${status}`}>{statusText}</span>
      </div>

      {periodId && mode === null && (
        <div className="actions">
          <button onClick={() => setMode('toplandi')}>{status === 'toplandi' ? 'Ekle' : 'Topla'}</button>
          <button className="ghost" onClick={() => setMode('toplanmadi')}>Toplanmadı</button>
        </div>
      )}

      {mode === 'toplandi' && (
        <div className="form-row">
          <input inputMode="decimal" placeholder="Tutar (₺)" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <button disabled={busy} onClick={() => save('toplandi')}>Kaydet</button>
          <button className="ghost" onClick={() => setMode(null)}>İptal</button>
        </div>
      )}

      {mode === 'toplanmadi' && (
        <div className="form-row">
          <input placeholder="Sebep (dolu değil, kapalı, ulaşılamadı…)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          <button disabled={busy} onClick={() => save('toplanmadi')}>Kaydet</button>
          <button className="ghost" onClick={() => setMode(null)}>İptal</button>
        </div>
      )}

      {err && <p className="error">{err}</p>}
    </li>
  );
}
