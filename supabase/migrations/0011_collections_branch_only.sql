-- Toplama girişi sadece şube hesaplarından yapılır. Yönetici toplamaları görür ama değiştiremez/silemez.
-- (collections_select politikası yönetici okumasına devam eder.)

drop policy if exists collections_admin_all on public.collections;
