-- Şube kullanıcıları kendi şubelerine kumbara ekleyebilir.
-- Kaldırma/güncelleme yetkisi hâlâ sadece admin'de.

create policy boxes_branch_insert on public.boxes for insert to authenticated
  with check (
    branch_id = public.my_branch_id()
    and status = 'aktif'
  );
