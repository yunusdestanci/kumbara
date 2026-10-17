import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { Profile } from './lib/types';
import { Login } from './pages/Login';
import { BranchPage } from './pages/BranchPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
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
        else setProfile(data as Profile);
      });
  }, [session]);

  const signOut = () => supabase.auth.signOut();

  if (checking) return <div className="center">Yükleniyor…</div>;
  if (!session) return <Login />;
  if (profileError) {
    return (
      <div className="center">
        <p className="error">{profileError}</p>
        <button onClick={signOut}>Çıkış yap</button>
      </div>
    );
  }
  if (!profile) return <div className="center">Yükleniyor…</div>;

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
