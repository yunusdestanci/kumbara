-- 1) Kapalı dönem kilidi: kapatılan ayın toplama kayıtları, yönetici dahil, değiştirilemez/silinemez.
--    Düzeltme gerekirse önce dönem yeniden açılır (Raporlar/Toplama ekranından "Dönemi aç").

create or replace function public.check_period_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p_status text;
begin
  select status into p_status
  from public.periods
  where id = coalesce(new.period_id, old.period_id);

  if p_status = 'kapali' then
    raise exception 'Bu dönem kapalı. Değişiklik yapmak için önce dönemi açın.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists collections_period_lock on public.collections;

create trigger collections_period_lock
  before insert or update or delete on public.collections
  for each row execute function public.check_period_open();

-- 2) Sıralı makbuz numarası: MK-2026-00001, MK-2026-00002 ...

alter table public.handovers add column if not exists receipt_no text unique;

create sequence if not exists public.handover_receipt_seq;

-- Mevcut teslimlere eski tarihe göre sıra ver
with numbered as (
  select id, row_number() over (order by handed_over_at, id) as n
  from public.handovers
  where receipt_no is null
)
update public.handovers h
set receipt_no = 'MK-' || to_char(h.handed_over_at at time zone 'Europe/Istanbul', 'YYYY') || '-' || lpad(numbered.n::text, 5, '0')
from numbered
where h.id = numbered.id;

-- Yeni numaralar mevcut sayının bir sonrasından başlasın
select setval('public.handover_receipt_seq', (select count(*) from public.handovers) + 1, false);

create or replace function public.set_receipt_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.receipt_no is null then
    new.receipt_no := 'MK-' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY') || '-'
      || lpad(nextval('public.handover_receipt_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists handover_receipt_no on public.handovers;

create trigger handover_receipt_no
  before insert on public.handovers
  for each row execute function public.set_receipt_no();
