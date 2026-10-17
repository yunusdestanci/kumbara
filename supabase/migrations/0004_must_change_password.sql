-- Şube hesabı ilk girişte şifre değiştirmek zorunda olsun diye bayrak.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- Şube kullanıcısı yeni şifresini belirleyince kendi bayrağını kapatır.
-- Profil tablosunu doğrudan güncelleme izni vermeden, sadece bu işlemi yapan fonksiyon.
create or replace function public.finish_password_change()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

revoke all on function public.finish_password_change() from public;
grant execute on function public.finish_password_change() to authenticated;
