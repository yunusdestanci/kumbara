-- Harcama fişleri için özel (herkese kapalı) depolama alanı.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Fişlere sadece merkez admin erişebilir (yükleme, okuma, silme).
create policy receipts_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());
