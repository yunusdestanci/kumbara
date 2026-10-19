export type Role = 'admin' | 'branch';

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
  branch_id: string | null;
}

export interface Branch {
  id: string;
  name: string;
  district: string | null;
  responsible_name: string | null;
  active: boolean;
}

export interface Box {
  id: string;
  branch_id: string;
  place_type: 'dukkan' | 'isyeri' | 'ev' | 'diger';
  place_name: string | null;
  address: string | null;
  status: 'aktif' | 'kaldirildi';
}

export interface Period {
  id: string;
  year: number;
  month: number;
  status: 'acik' | 'kapali';
}

export type CollectionStatus = 'bekliyor' | 'toplandi' | 'toplanmadi';

export interface Collection {
  id: string;
  period_id: string;
  box_id: string;
  status: CollectionStatus;
  amount: number | null;
  reason: string | null;
  collected_at: string | null;
  counted_by: string | null;
}

export interface Handover {
  id: string;
  branch_id: string;
  period_id: string | null;
  amount: number;
  handed_over_at: string;
  status: 'bekliyor' | 'onaylandi';
  note: string | null;
  confirmed_at: string | null;
  receipt_no: string | null;
}
