-- Şube, toplamadığı para kadar teslim kaydı açabilsin.
-- Bakiye = şubenin tüm toplanan tutarları - şubenin mevcut tüm teslim kayıtları (bekleyen + onaylanan).
create or replace function public.check_handover_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  collected numeric;
  committed numeric;
begin
  select coalesce(sum(c.amount), 0) into collected
  from public.collections c
  join public.boxes b on b.id = c.box_id
  where b.branch_id = new.branch_id and c.status = 'toplandi';

  select coalesce(sum(h.amount), 0) into committed
  from public.handovers h
  where h.branch_id = new.branch_id and h.id <> new.id;

  if committed + new.amount > collected then
    raise exception 'Şubede teslim edilecek bakiye yetersiz. Teslim edilebilir: % TL', (collected - committed)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists handover_balance_check on public.handovers;

create trigger handover_balance_check
  before insert or update of amount, branch_id on public.handovers
  for each row execute function public.check_handover_balance();
