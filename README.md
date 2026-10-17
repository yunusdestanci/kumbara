# Kumbara

Vakıfın şubeleri için kumbara toplama, sayım, teslim ve harcama takip uygulaması.

- **Admin (merkez):** tüm şubeler, dönem özeti, teslim onayı
- **Şube:** sadece kendi kumbaraları, toplama girişi, merkeze teslim kaydı
- **Telefon:** tarayıcıdan açıp "Ana ekrana ekle" ile uygulama gibi kurulur (PWA)

## Teknoloji

- React + TypeScript + Vite
- Supabase (veritabanı, kimlik doğrulama, satır seviyesi güvenlik - RLS)

## Kurulum

1. Bağımlılıkları kur:
   ```bash
   npm install
   ```
2. `.env.example` dosyasını `.env` olarak kopyala ve Supabase bilgilerini yaz:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
   Yalnızca **anon** anahtarı kullanılır. `service_role` anahtarını asla buraya koyma.
3. Supabase SQL Editor'da sırayla çalıştır:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
4. Geliştirme sunucusu:
   ```bash
   npm run dev
   ```
5. Derleme kontrolü:
   ```bash
   npm run build
   ```

## Kullanıcı oluşturma

Supabase panelinde **Authentication → Users** bölümünden kullanıcıları ekle. Sonra `profiles` tablosuna kayıt ekle:

- Admin: `role = 'admin'`, `branch_id` boş
- Şube kullanıcısı: `role = 'branch'`, `branch_id` ilgili şubenin id'si

## Yayınlama

Vercel veya Netlify'a bağla. HTTPS sertifikası otomatik gelir, tarayıcıda güvenlik uyarısı çıkmaz. `.env` değerlerini platformun ortam değişkenlerine ekle.

## Henüz yapılmayanlar

- Kumbara ekleme/düzenleme ekranı (şimdilik Supabase panelinden)
- Harcama ekranı ve fiş yükleme
- PWA ikonları (`public/` klasörüne 192 ve 512 piksel ikon eklenmeli)
