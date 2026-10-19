import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { dateTr, money } from '../lib/format';

interface EntryRow {
  id: number;
  amount: number;
  total_after: number;
  entered_at: string;
}

interface Props {
  collectionId: string;
  // Tutar değişince listeyi yeniden yüklemek için
  version: string;
}

// Bir kumbaranın bu ay girilen tutarlarını tek tek (alt alta) gösterir.
export function CollectionEntries({ collectionId, version }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EntryRow[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    supabase
      .from('collection_entries')
      .select('id,amount,total_after,entered_at')
      .eq('collection_id', collectionId)
      .order('entered_at', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        setRows(error ? [] : ((data ?? []) as EntryRow[]));
      });
    return () => {
      alive = false;
    };
  }, [open, collectionId, version]);

  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="ghost" onClick={() => setOpen((o) => !o)} style={{ padding: '2px 8px', fontSize: 13 }}>
        {open ? 'Ayrıntıyı gizle' : 'Ayrıntıyı göster'}
      </button>
      {open && rows && (
        <div className="muted small" style={{ marginTop: 6 }}>
          {rows.length === 0 ? (
            <div>Ayrıntı kaydı yok. Bu tutar ayrıntı kaydı açılmadan önce girilmiş.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {rows.map((r) => (
                <li key={r.id}>
                  {dateTr(r.entered_at)} · {money(r.amount)} (toplam {money(r.total_after)})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
