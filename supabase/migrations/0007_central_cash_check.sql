-- Merkez kasa kontrolü: genel merkez harcaması, onaylanmış teslimlerden oluşan kasa bakiyesini aşamaz.
-- Şube harcamaları (branch_id dolu) bu kontrolün dışındadır.

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

  select coalesce(sum(amount), 0) into income
  from public.handovers
  where status = 'onaylandi';

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

drop trigger if exists central_cash_check on public.expenses;

create trigger central_cash_check
before insert or update of amount, branch_id on public.expenses
for each row execute function public.check_central_cash();
