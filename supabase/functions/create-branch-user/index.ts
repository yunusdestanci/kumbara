// Edge Function: admin, bir şube için giriş hesabı oluşturur.
// Gizli anahtar (service role) sadece bu sunucu tarafında kullanılır, tarayıcıya gitmez.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tarayıcıdan (localhost veya web sitesi) çağrılabilmesi için CORS başlıkları
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  // Tarayıcının ön kontrol isteği (preflight)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Yetkisiz' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) İsteği yapan kullanıcı kim?
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'Yetkisiz' }, 401);

  // 2) Admin mi?
  const { data: profile } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') {
    return json({ error: 'Sadece merkez yönetici şube kullanıcısı oluşturabilir.' }, 403);
  }

  // 3) Girdileri doğrula
  let body: { email?: string; password?: string; branch_id?: string; full_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Geçersiz istek.' }, 400);
  }
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const branchId = body.branch_id ?? '';
  const fullName = (body.full_name ?? '').trim() || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Geçerli bir e-posta girin.' }, 400);
  if (password.length < 8) return json({ error: 'Şifre en az 8 karakter olmalı.' }, 400);
  if (!UUID_RE.test(branchId)) return json({ error: 'Geçerli bir şube seçin.' }, 400);

  // 4) Kullanıcıyı oluştur (sunucu tarafında, gizli anahtarla)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return json({ error: createErr?.message ?? 'Kullanıcı oluşturulamadı.' }, 400);
  }

  // 5) Profil kaydını ekle; hata olursa auth kullanıcısını geri al
  const { error: profileErr } = await admin.from('profiles').insert({
    id: created.user.id,
    full_name: fullName,
    role: 'branch',
    branch_id: branchId,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: profileErr.message }, 400);
  }

  return json({ ok: true, email });
});
