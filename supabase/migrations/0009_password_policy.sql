-- Şifre süresi: son değişim tarihini tut, her değişimde sıfırla (6 ayda bir zorunlu değişim için).

alter table public.profiles add column if not exists password_changed_at timestamptz;

create or replace function public.finish_password_change()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set must_change_password = false,
      password_changed_at = now()
  where id = auth.uid();
$$;

revoke all on function public.finish_password_change() from public;
grant execute on function public.finish_password_change() to authenticated;
