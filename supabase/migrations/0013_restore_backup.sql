-- Yedekten geri yükleme. Yalnızca yönetici çalıştırabilir.
-- Mevcut kayıtlar silinmez/değiştirilmez: yedekte olup veritabanında olmayan kayıtlar eklenir.
-- Tüm işlem tek transaction'dır: bir hata olursa hiçbir kayıt yazılmaz.

create or replace function public.restore_backup(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t jsonb := coalesce(payload -> 'tables', '{}'::jsonb);
  c_branches int := 0;
  c_boxes int := 0;
  c_entries int := 0;
  c_handovers int := 0;
  c_expenses int := 0;
  c_incomes int := 0;
  new_period_ids uuid[] := '{}';
  new_collection_ids uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Yalnızca yönetici geri yükleme yapabilir.';
  end if;

  -- 1) Şubeler
  insert into public.branches
  select * from jsonb_populate_recordset(null::public.branches, coalesce(t -> 'branches', '[]'::jsonb))
  on conflict (id) do nothing;
  get diagnostics c_branches = row_count;

  -- 2) Kumbaralar
  insert into public.boxes
  select * from jsonb_populate_recordset(null::public.boxes, coalesce(t -> 'boxes', '[]'::jsonb))
  on conflict (id) do nothing;
  get diagnostics c_boxes = row_count;

  -- 3) Dönemler: önce açık eklenir (kapalı dönem kilidi toplamaları engellemesin), en sonda yedekteki durum uygulanır
  with ins as (
    insert into public.periods (id, year, month, status, closed_at)
    select p.id, p.year, p.month, 'acik', null::timestamptz
    from jsonb_populate_recordset(null::public.periods, coalesce(t -> 'periods', '[]'::jsonb)) p
    on conflict (id) do nothing
    returning id
  )
  select coalesce(array_agg(id), '{}') into new_period_ids from ins;

  -- 4) Toplamalar (kumbara başına dönem kaydı). Kapalı mevcut dönemlerin toplamaları atlanır.
  with ins as (
    insert into public.collections (id, period_id, box_id, status, amount, reason, collected_at, counted_by, note)
    select c.id, c.period_id, c.box_id, c.status, c.amount, c.reason, c.collected_at,
      case when exists (select 1 from public.profiles pr where pr.id = c.counted_by) then c.counted_by else auth.uid() end,
      c.note
    from jsonb_populate_recordset(null::public.collections, coalesce(t -> 'collections', '[]'::jsonb)) c
    where exists (select 1 from public.periods p where p.id = c.period_id and p.status = 'acik')
      and exists (select 1 from public.boxes b where b.id = c.box_id)
    on conflict (id) do nothing
    returning id
  )
  select coalesce(array_agg(id), '{}') into new_collection_ids from ins;

  -- 5) Toplama ayrıntıları: toplama tetikleyicisi otomatik tek satır yazdığı için, yeni toplamalarınkini silip yedektekini yazıyoruz
  delete from public.collection_entries where collection_id = any(new_collection_ids);

  with ins as (
    insert into public.collection_entries (collection_id, amount, total_after, entered_by, entered_at)
    select e.collection_id, e.amount, e.total_after,
      case when exists (select 1 from public.profiles pr where pr.id = e.entered_by) then e.entered_by else auth.uid() end,
      e.entered_at
    from jsonb_populate_recordset(null::public.collection_entries, coalesce(t -> 'collection_entries', '[]'::jsonb)) e
    where e.collection_id = any(new_collection_ids)
    returning id
  )
  select count(*) into c_entries from ins;

  -- 6) Merkez girişleri (dış gelirler). Harcama kontrolünden önce eklenmeli.
  insert into public.central_incomes (id, amount, received_on, source, description, created_by, created_at)
  select x.id, x.amount, x.received_on, x.source, x.description,
    case when exists (select 1 from public.profiles pr where pr.id = x.created_by) then x.created_by else auth.uid() end,
    x.created_at
  from jsonb_populate_recordset(null::public.central_incomes, coalesce(t -> 'central_incomes', '[]'::jsonb)) x
  on conflict (id) do nothing;
  get diagnostics c_incomes = row_count;

  -- 7) Teslimler (bakiye kontrolü toplamalardan sonra çalışır)
  insert into public.handovers (id, branch_id, period_id, amount, handed_over_at, handed_by, status, confirmed_by, confirmed_at, note, receipt_no)
  select h.id, h.branch_id, h.period_id, h.amount, h.handed_over_at,
    case when exists (select 1 from public.profiles pr where pr.id = h.handed_by) then h.handed_by else auth.uid() end,
    h.status,
    case
      when h.confirmed_by is null then null
      when exists (select 1 from public.profiles pr where pr.id = h.confirmed_by) then h.confirmed_by
      else auth.uid()
    end,
    h.confirmed_at, h.note, h.receipt_no
  from jsonb_populate_recordset(null::public.handovers, coalesce(t -> 'handovers', '[]'::jsonb)) h
  on conflict (id) do nothing;
  get diagnostics c_handovers = row_count;

  -- 8) Harcamalar (merkez harcamaları kasa bakiyesini kontrol eder)
  insert into public.expenses (id, branch_id, amount, category, description, spent_on, receipt_path, created_by, created_at)
  select x.id, x.branch_id, x.amount, x.category, x.description, x.spent_on, x.receipt_path,
    case when exists (select 1 from public.profiles pr where pr.id = x.created_by) then x.created_by else auth.uid() end,
    x.created_at
  from jsonb_populate_recordset(null::public.expenses, coalesce(t -> 'expenses', '[]'::jsonb)) x
  on conflict (id) do nothing;
  get diagnostics c_expenses = row_count;

  -- 9) Yedekteki kapalı dönem durumunu uygula (yalnızca bu geri yüklemede eklenen dönemler)
  update public.periods p
  set status = 'kapali', closed_at = b.closed_at
  from jsonb_populate_recordset(null::public.periods, coalesce(t -> 'periods', '[]'::jsonb)) b
  where b.id = p.id and p.id = any(new_period_ids) and b.status = 'kapali';

  return jsonb_build_object(
    'branches', c_branches,
    'boxes', c_boxes,
    'periods', cardinality(new_period_ids),
    'collections', cardinality(new_collection_ids),
    'collection_entries', c_entries,
    'central_incomes', c_incomes,
    'handovers', c_handovers,
    'expenses', c_expenses
  );
end;
$$;

revoke all on function public.restore_backup(jsonb) from public;
grant execute on function public.restore_backup(jsonb) to authenticated;
