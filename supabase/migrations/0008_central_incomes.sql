-- Merkez kasaya şube dışı girişler (bağış, banka transferi vb.). Yalnızca merkez yönetici yazar.

create table if not exists public.central_incomes (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12,2) not null check (amount > 0),
  received_on date not null default current_date,
  source text not null,
  description text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.central_incomes enable row level security;

drop policy if exists central_incomes_admin_all on public.central_incomes;
create policy central_incomes_admin_all on public.central_incomes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Merkez kasa bakiyesi: onaylanmış şube teslimleri + dış girişler - genel merkez harcamaları
create or replace function public.check_central_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  income numeric;
  spent numeric;
begin
  if new.branch_id is not null then
    return new;
  end if;

  select coalesce((select sum(amount) from public.handovers where status = 'onaylandi'), 0)
       + coalesce((select sum(amount) from public.central_incomes), 0)
    into income;

  select coalesce(sum(amount), 0) into spent
  from public.expenses
  where branch_id is null
    and id <> new.id;

  if spent + new.amount > income then
    raise exception 'Merkez kasada yeterli bakiye yok. Kullanılabilir: % TL', (income - spent)::text;
  end if;

  return new;
end;
$$;
