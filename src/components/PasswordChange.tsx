import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  // true: şube ilk girişte şifre değiştirmek zorunda (ekranın geri kalanı kilitli)
  required: boolean;
  onDone: () => void;
}

// Şube kullanıcısının kendi şifresini değiştirmesi.
export function PasswordChange({ required, onDone }: Props) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    if (pw.length < 8) {
      setErr('Şifre en az 8 karakter olmalı.');
      return;
    }
    if (pw !== pw2) {
      setErr('Şifreler eşleşmiyor.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    if (required) {
      const { error: rpcErr } = await supabase.rpc('finish_password_change');
      if (rpcErr) {
        setBusy(false);
        setErr(rpcErr.message);
        return;
      }
    }
    setBusy(false);
    setPw('');
    setPw2('');
    setOk(true);
    onDone();
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>{required ? 'Yeni şifre belirleyin' : 'Şifremi değiştir'}</h3>
      {required && (
        <p className="muted small">Hesabınız için yeni bir şifre belirlemeniz gerekiyor. Devam etmek için şifrenizi değiştirin.</p>
      )}
      <div className="form-row">
        <input
          type="password"
          placeholder="Yeni şifre (en az 8 karakter)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          required
        />
        <input
          type="password"
          placeholder="Yeni şifre (tekrar)"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Şifreyi kaydet'}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      {ok && !required && <p className="badge onaylandi">Şifre güncellendi.</p>}
    </form>
  );
}
