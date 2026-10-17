import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Branch } from '../lib/types';

interface Props {
  branches: Branch[];
}

// Edge Function'dan dönen hatayı kullanıcıya okunur şekilde göster
async function readError(error: { message: string; context?: unknown }): Promise<string> {
  try {
    const ctx = error.context as Response | undefined;
    if (ctx) {
      const payload = await ctx.json();
      if (payload?.error) return payload.error;
    }
  } catch {
    /* gövde okunamadıysa genel mesaj kalsın */
  }
  return error.message;
}

// Admin: şube giriş hesabı oluşturur veya mevcut hesabın e-posta/şifresini değiştirir (Edge Function üzerinden).
export function BranchUserForm({ branches }: Props) {
  const [mode, setMode] = useState<'create' | 'update'>('create');
  const [branchId, setBranchId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function switchMode(next: 'create' | 'update') {
    setMode(next);
    setMsg(null);
    setEmail('');
    setPassword('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!branchId) {
      setMsg({ type: 'err', text: 'Önce bir şube seçin.' });
      return;
    }
    setBusy(true);
    const branch = branches.find((b) => b.id === branchId);

    const body =
      mode === 'create'
        ? { action: 'create', email, password, branch_id: branchId, full_name: branch?.name ?? null }
        : {
            action: 'update',
            branch_id: branchId,
            email: email.trim() || undefined,
            password: password || undefined,
          };

    const { data, error } = await supabase.functions.invoke('create-branch-user', { body });
    setBusy(false);

    if (error) {
      setMsg({ type: 'err', text: await readError(error) });
      return;
    }

    const savedEmail = (data as { email: string | null })?.email;
    setMsg({
      type: 'ok',
      text:
        mode === 'create'
          ? `${savedEmail} hesabı oluşturuldu.`
          : `${branch?.name ?? 'Şube'} giriş bilgileri güncellendi${savedEmail ? ` (${savedEmail})` : ''}.`,
    });
    setEmail('');
    setPassword('');
  }

  const isCreate = mode === 'create';

  return (
    <form className="card" onSubmit={submit}>
      <div className="row">
        <h3 style={{ marginTop: 0 }}>{isCreate ? 'Şube giriş hesabı oluştur' : 'Şube giriş hesabını düzenle'}</h3>
        <div className="form-row">
          <button type="button" className={isCreate ? '' : 'ghost'} onClick={() => switchMode('create')}>
            Yeni hesap
          </button>
          <button type="button" className={isCreate ? 'ghost' : ''} onClick={() => switchMode('update')}>
            Mevcut hesabı düzenle
          </button>
        </div>
      </div>

      <div className="form-row">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
          <option value="">Şube seçin</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <input
          type="email"
          placeholder={isCreate ? 'Giriş e-postası' : 'Yeni e-posta (değişmeyecekse boş bırakın)'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required={isCreate}
          autoComplete="off"
        />
        <input
          type="text"
          placeholder={isCreate ? 'Geçici şifre (en az 8 karakter)' : 'Yeni şifre (değişmeyecekse boş bırakın)'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={isCreate}
          autoComplete="new-password"
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Kaydediliyor…' : isCreate ? 'Hesap oluştur' : 'Güncelle'}
        </button>
      </div>
      {msg && <p className={msg.type === 'ok' ? 'badge onaylandi' : 'error'}>{msg.text}</p>}
      <p className="muted small">
        {isCreate
          ? 'Şifreyi şubeye ilet. Şube ilk girişte kendi yeni şifresini belirlemek zorunda.'
          : 'Sadece değiştirmek istediğiniz alanı doldurun. Şifre en az 8 karakter olmalı. Şifre değişirse şube bir sonraki girişte yeni şifre belirler.'}
      </p>
    </form>
  );
}
