import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Branch } from '../lib/types';

interface Props {
  branches: Branch[];
}

// Admin: seçilen şube için giriş hesabı oluşturur (Edge Function üzerinden).
export function BranchUserForm({ branches }: Props) {
  const [branchId, setBranchId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!branchId) {
      setMsg({ type: 'err', text: 'Önce bir şube seçin.' });
      return;
    }
    setBusy(true);
    const branch = branches.find((b) => b.id === branchId);
    const { data, error } = await supabase.functions.invoke('create-branch-user', {
      body: {
        email,
        password,
        branch_id: branchId,
        full_name: branch?.name ?? null,
      },
    });
    setBusy(false);

    if (error) {
      // Edge Function hata durumunda gövdede açıklama döner
      let text = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          const payload = await ctx.json();
          if (payload?.error) text = payload.error;
        }
      } catch {
        /* gövde okunamadıysa genel mesaj kalsın */
      }
      setMsg({ type: 'err', text });
      return;
    }

    setMsg({ type: 'ok', text: `${(data as { email: string }).email} hesabı oluşturuldu.` });
    setEmail('');
    setPassword('');
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>Şube giriş hesabı oluştur</h3>
      <div className="form-row">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
          <option value="">Şube seçin</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <input
          type="email"
          placeholder="Giriş e-postası"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="off"
        />
        <input
          type="text"
          placeholder="Geçici şifre (en az 8 karakter)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Oluşturuluyor…' : 'Hesap oluştur'}
        </button>
      </div>
      {msg && <p className={msg.type === 'ok' ? 'badge onaylandi' : 'error'}>{msg.text}</p>}
      <p className="muted small">
        Şifreyi şubeye ilet. Şube ilk girişte şifreyi değiştirmeli (bu özellik sonraki adımda eklenebilir).
      </p>
    </form>
  );
}
