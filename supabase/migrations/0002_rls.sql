-- Kumbara takip sistemi: Row Level Security (RLS) kuralları
-- Kural özeti:
--   admin  : her şeyi görür ve yönetir
--   şube   : sadece kendi şubesinin kumbaralarını, toplamalarını ve teslimlerini görür/girer
--   şube   : teslimi onaylayamaz, harcama göremez/giremez, dönem kapatamaz

-- Yardımcı fonksiyonlar (RLS içinde tekrar tekrar kullanılır)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_branch_id()
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from profiles where id = auth.uid();
$$;

create or replace function public.box_is_mine(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from boxes where id = b and branch_id = public.my_branch_id());
$$;

create or replace function public.period_is_open(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from periods where id = p and status = 'acik');
$$;

-- Tüm tablolarda RLS aktif
alter table public.branches     enable row level security;
alter table public.profiles     enable row level security;
alter table public.boxes        enable row level security;
alter table public.periods      enable row level security;
alter table public.collections  enable row level security;
alter table public.handovers    enable row level security;
alter table public.expenses     enable row level security;
alter table public.audit_log    enable row level security;

-- branches
create policy branches_select on public.branches for select to authenticated
  using (public.is_admin() or id = public.my_branch_id());
create policy branches_admin_write on public.branches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: herkes kendi profilini görür, admin hepsini; rol değişikliği sadece admin
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- boxes: şube kendi kumbaralarını görür, yönetim sadece admin
create policy boxes_select on public.boxes for select to authenticated
  using (public.is_admin() or branch_id = public.my_branch_id());
create policy boxes_admin_write on public.boxes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- periods: herkes görür, sadece admin açıp kapatır
create policy periods_select on public.periods for select to authenticated
  using (true);
create policy periods_admin_write on public.periods for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- collections: şube kendi kumbarasının toplamasını açık dönemde girer/düzeltir
create policy collections_select on public.collections for select to authenticated
  using (public.is_admin() or public.box_is_mine(box_id));
create policy collections_branch_insert on public.collections for insert to authenticated
  with check (public.box_is_mine(box_id) and public.period_is_open(period_id) and counted_by = auth.uid());
create policy collections_branch_update on public.collections for update to authenticated
  using (public.box_is_mine(box_id) and public.period_is_open(period_id))
  with check (public.box_is_mine(box_id) and public.period_is_open(period_id) and counted_by = auth.uid());
create policy collections_admin_all on public.collections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- handovers: şube teslimi "bekliyor" olarak açar, sadece admin onaylar
create policy handovers_select on public.handovers for select to authenticated
  using (public.is_admin() or branch_id = public.my_branch_id());
create policy handovers_branch_insert on public.handovers for insert to authenticated
  with check (branch_id = public.my_branch_id() and handed_by = auth.uid() and status = 'bekliyor');
create policy handovers_admin_all on public.handovers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- expenses: şube sadece kendi şubesine ait harcamaları görür, yazma sadece admin
create policy expenses_select on public.expenses for select to authenticated
  using (public.is_admin() or (branch_id is not null and branch_id = public.my_branch_id()));
create policy expenses_admin_write on public.expenses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit_log: sadece admin okur, istemci yazamaz (yazımı trigger yapar)
create policy audit_log_admin_select on public.audit_log for select to authenticated
  using (public.is_admin());

-- Değişiklik günlüğü trigger'ı
create or replace function public.log_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, row_id, action, changed_by, old_data, new_data)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_boxes after insert or update or delete on public.boxes
  for each row execute function public.log_change();
create trigger audit_collections after insert or update or delete on public.collections
  for each row execute function public.log_change();
create trigger audit_handovers after insert or update or delete on public.handovers
  for each row execute function public.log_change();
create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.log_change();
