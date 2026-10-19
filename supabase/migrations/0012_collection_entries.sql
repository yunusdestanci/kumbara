-- Her toplama girişini (ekleme) ayrı bir satır olarak tutar. Örn: 500 ve 250 ayrı görünür.
-- Kayıt, collections tablosuna yazılan her tutar artışında veritabanı tarafından otomatik oluşturulur.

create table if not exists public.collection_entries (
  id            bigint generated always as identity primary key,
  collection_id uuid not null references public.collections(id) on delete cascade,
  amount        numeric(12,2) not null,
  total_after   numeric(12,2) not null,
  entered_by    uuid references public.profiles(id),
  entered_at    timestamptz not null default now()
);

create index if not exists collection_entries_collection_idx on public.collection_entries (collection_id);

alter table public.collection_entries enable row level security;

-- Okuma: yönetici hepsini, şube sadece kendi kumbarasının girişlerini görür
create policy collection_entries_select on public.collection_entries for select to authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_entries.collection_id
        and (public.is_admin() or public.box_is_mine(c.box_id))
    )
  );

create or replace function public.log_collection_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta numeric;
begin
  if new.status = 'toplandi' then
    delta := new.amount - coalesce(
      case when tg_op = 'UPDATE' and old.status = 'toplandi' then old.amount end,
      0
    );
    if delta <> 0 then
      insert into public.collection_entries (collection_id, amount, total_after, entered_by)
      values (new.id, delta, new.amount, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists collection_entry_log on public.collections;

create trigger collection_entry_log
  after insert or update of amount, status on public.collections
  for each row execute function public.log_collection_entry();
