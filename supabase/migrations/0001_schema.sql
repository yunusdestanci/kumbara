-- Kumbara takip sistemi: tablo şeması
-- Para tutarları numeric(12,2), zamanlar timestamptz (UTC) olarak tutulur.

-- Şubeler (vakıfın ~50 şubesi)
create table public.branches (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  district         text,
  responsible_name text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Kullanıcı profilleri: her auth kullanıcısı ya admin ya da bir şubeye bağlı
create table public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role      text not null check (role in ('admin', 'branch')),
  branch_id uuid references public.branches(id),
  constraint branch_user_needs_branch check (role = 'admin' or branch_id is not null)
);

-- Kumbaralar (500–1000 adet): her biri bir şubeye bağlı
create table public.boxes (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches(id),
  place_type  text not null check (place_type in ('dukkan', 'isyeri', 'ev', 'diger')),
  place_name  text,
  address     text,
  status      text not null default 'aktif' check (status in ('aktif', 'kaldirildi')),
  created_at  timestamptz not null default now()
);

-- Aylık dönemler: ay kapanınca değişiklik kilitlenir
create table public.periods (
  id        uuid primary key default gen_random_uuid(),
  year      int not null check (year between 2000 and 2100),
  month     int not null check (month between 1 and 12),
  status    text not null default 'acik' check (status in ('acik', 'kapali')),
  closed_at timestamptz,
  unique (year, month)
);

-- Toplama kaydı: dönem + kumbara başına bir satır
create table public.collections (
  id           uuid primary key default gen_random_uuid(),
  period_id    uuid not null references public.periods(id),
  box_id       uuid not null references public.boxes(id),
  status       text not null default 'bekliyor'
                 check (status in ('bekliyor', 'toplandi', 'toplanmadi')),
  amount       numeric(12,2) check (amount is null or amount >= 0),
  reason       text,                 -- toplanmadıysa sebep (dolu değil, kapalı, ulaşılamadı...)
  collected_at timestamptz,
  counted_by   uuid references public.profiles(id),
  note         text,
  unique (period_id, box_id),
  constraint collected_needs_amount check (status <> 'toplandi' or amount is not null),
  constraint missed_needs_reason check (status <> 'toplanmadi' or reason is not null)
);

-- Nakit teslimi: şube → merkez admin
create table public.handovers (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references public.branches(id),
  period_id      uuid references public.periods(id),
  amount         numeric(12,2) not null check (amount > 0),
  handed_over_at timestamptz not null default now(),
  handed_by      uuid not null references public.profiles(id),
  status         text not null default 'bekliyor' check (status in ('bekliyor', 'onaylandi')),
  confirmed_by   uuid references public.profiles(id),
  confirmed_at   timestamptz,
  note           text,
  constraint confirmed_needs_admin check (status <> 'onaylandi' or confirmed_by is not null)
);

-- Harcamalar: branch_id boşsa genel merkez harcaması
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid references public.branches(id),
  amount       numeric(12,2) not null check (amount > 0),
  category     text not null,
  description  text,
  spent_on     date not null default current_date,
  receipt_path text,                 -- Supabase Storage yolu (fiş fotoğrafı)
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- Değişiklik günlüğü: kim neyi ne zaman değiştirdi
create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     uuid,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_data   jsonb,
  new_data   jsonb
);

create index on public.boxes (branch_id);
create index on public.collections (period_id);
create index on public.collections (box_id);
create index on public.handovers (branch_id);
create index on public.expenses (branch_id);
