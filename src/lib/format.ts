const moneyFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 2,
});

export const money = (n: number): string => moneyFormatter.format(n);

export const monthName = (m: number): string =>
  ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
   'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][m - 1];

export const dateTr = (iso: string): string =>
  new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

// Kullanıcı girdisini sayıya çevirir ("12,5" ve "12.5" ikisi de olur). Geçersizse null.
export const parseAmount = (raw: string): number | null => {
  const n = Number(raw.replace(',', '.').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Adresi Google Haritalar'da arama bağlantısına çevirir (yeni sekmede açılır, API anahtarı gerektirmez).
export const mapsUrl = (address: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
