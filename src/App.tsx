import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { Profile } from './lib/types';
import { Login } from './pages/Login';
import { BranchPage } from './pages/BranchPage';
import { AdminPage } from './pages/AdminPage';
import { PasswordChange } from './components/PasswordChange';

interface ProfileRow extends Profile {
  must_change_password?: boolean;
  password_changed_at?: string | null;
}

// Şifre en fazla 6 ayda bir değiştirilmeli
const PASSWORD_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

function passwordExpired(p: ProfileRow): boolean {
  if (!p.password_changed_at) return true;
  return Date.now() - new Date(p.password_changed_at).getTime() > PASSWORD_MAX_AGE_MS;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  // Şifre sıfırlama bağlantısından gelindiyse yeni şifre belirlenmeli
  const [recovery, setRecovery] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    setProfileError(null);
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setProfileError(error.message);
        else if (!data) setProfileError('Bu hesap için profil bulunamadı. Merkez yöneticisi ile iletişime geçin.');
        else setProfile(data as ProfileRow);
      });
  }, [session, reloadKey]);

  const signOut = () => supabase.auth.signOut();
  const refresh = () => setReloadKey((k) => k + 1);

  if (checking) return <div className="center">Yükleniyor…</div>;
  if (!session) return <Login />;
  if (recovery) {
    return (
      <div className="center">
        <PasswordChange
          required
          onDone={() => {
            setRecovery(false);
            refresh();
          }}
        />
      </div>
    );
  }
  if (profileError) {
    return (
      <div className="center">
        <p className="error">{profileError}</p>
        <button onClick={signOut}>Çıkış yap</button>
      </div>
    );
  }
  if (!profile) return <div className="center">Yükleniyor…</div>;

  // İlk giriş ya da 6 ayı dolmuş şifre: yeni şifre belirlenmeden devam edilemez
  if (profile.must_change_password || passwordExpired(profile)) {
    return (
      <div className="center">
        <PasswordChange required onDone={refresh} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>Kumbara Takip</strong>
        <span className="muted">{profile.role === 'admin' ? 'Merkez yönetici' : 'Şube'}</span>
        <button className="ghost" onClick={signOut}>Çıkış</button>
      </header>
      <main>
        {profile.role === 'admin' ? (
          <AdminPage userId={profile.id} />
        ) : (
          <BranchPage branchId={profile.branch_id!} userId={profile.id} />
        )}
      </main>
    </div>
  );
}
