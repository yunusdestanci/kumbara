import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError('E-posta veya şifre hatalı.');
  }

  // Şifre sıfırlama bağlantısını kullanıcının e-posta adresine gönderir.
  async function sendReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) {
      setError('Sıfırlama bağlantısı gönderilemedi. Birkaç dakika sonra tekrar deneyin.');
      return;
    }
    setInfo('E-posta adresinize şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu (ve spam klasörünü) kontrol edin.');
  }

  if (forgot) {
    return (
      <div className="center">
        <form className="card login" onSubmit={sendReset}>
          <img src="/logo.png" alt="Serhendi Vakfı" style={{ width: 200, display: 'block', margin: '0 auto 4px' }} />
          <h1 style={{ textAlign: 'center', marginBottom: 2 }}>Şifremi unuttum</h1>
          <p className="muted small" style={{ textAlign: 'center', marginTop: 0 }}>
            Hesabınıza kayıtlı e-posta adresini yazın, şifre sıfırlama bağlantısı gönderelim.
          </p>
          <label>
            E-posta
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </label>
          {error && <p className="error">{error}</p>}
          {info && <p className="badge onaylandi">{info}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setForgot(false);
              setError(null);
              setInfo(null);
            }}
          >
            Girişe dön
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <img src="/logo.png" alt="Serhendi Vakfı" style={{ width: 200, display: 'block', margin: '0 auto 4px' }} />
        <h1 style={{ textAlign: 'center', marginBottom: 2 }}>Serhendi Halkalı</h1>
        <p className="muted small" style={{ textAlign: 'center', marginTop: 0 }}>Kumbara Takip</p>
        <label>
          E-posta
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          Şifre
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
        <button type="button" className="ghost" onClick={() => setForgot(true)}>
          Şifremi unuttum
        </button>
      </form>
    </div>
  );
}
