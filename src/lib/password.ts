// Şifre kuralı: en az 8 karakter, en az 1 büyük harf, 1 küçük harf, 1 rakam ve 1 simge.
export const PASSWORD_RULE_TEXT =
  'En az 8 karakter; en az 1 büyük harf, 1 küçük harf, 1 rakam ve 1 simge (!, @, # gibi) içermeli.';

// Geçersizse Türkçe hata mesajı döner, geçerliyse null.
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Şifre en az 8 karakter olmalı.';
  if (!/[A-ZÇĞİÖŞÜ]/.test(pw)) return 'Şifrede en az 1 büyük harf olmalı.';
  if (!/[a-zçğıöşü]/.test(pw)) return 'Şifrede en az 1 küçük harf olmalı.';
  if (!/[0-9]/.test(pw)) return 'Şifrede en az 1 rakam olmalı.';
  if (!/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/.test(pw)) return 'Şifrede en az 1 simge olmalı (örn. ! @ # $ %).';
  return null;
}
