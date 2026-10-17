import { dateTr, money } from './format';

export interface ReceiptData {
  receiptNo: string;
  handedAt: string;
  branchName: string;
  amount: number;
  note: string | null;
  status: 'bekliyor' | 'onaylandi';
  confirmedAt: string | null;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

// Teslim makbuzunu yeni pencerede açar ve yazdırma penceresini başlatır (PDF olarak da kaydedilebilir).
export function printReceipt(d: ReceiptData) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Makbuz açılamadı. Tarayıcının pop-up engelini kaldırıp tekrar deneyin.');
    return;
  }

  const logo = `${window.location.origin}/logo.png`;
  const confirmed = d.status === 'onaylandi' && d.confirmedAt ? dateTr(d.confirmedAt) : 'Onay bekliyor';
  const status = d.status === 'onaylandi' ? 'Onaylandı' : 'Onay bekliyor';
  const branch = esc(d.branchName);

  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Makbuz ${esc(d.receiptNo)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 32px; }
  .sheet { max-width: 640px; margin: 0 auto; border: 2px solid #1f6f4a; border-radius: 12px; padding: 28px; }
  header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #1f6f4a; padding-bottom: 14px; margin-bottom: 18px; }
  header img { width: 90px; height: 90px; }
  h1 { margin: 0; font-size: 22px; color: #1f6f4a; }
  .sub { color: #555; font-size: 13px; margin-top: 4px; }
  .no { text-align: right; font-size: 13px; color: #555; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  td { padding: 9px 4px; border-bottom: 1px solid #ddd; font-size: 15px; }
  td.k { color: #555; width: 40%; }
  .amount { font-size: 26px; font-weight: 700; color: #1f6f4a; text-align: right; margin-top: 14px; }
  .sign { display: flex; justify-content: space-between; margin-top: 56px; font-size: 14px; }
  .sign div { width: 42%; border-top: 1px solid #111; padding-top: 6px; text-align: center; }
  .toolbar { text-align: center; margin-bottom: 18px; }
  .toolbar button { padding: 10px 18px; font-size: 15px; margin: 0 6px; border-radius: 8px; border: 1px solid #1f6f4a; background: #1f6f4a; color: #fff; cursor: pointer; }
  .toolbar button.sec { background: #fff; color: #1f6f4a; }
  @media print { body { padding: 0; } .sheet { border: none; } .toolbar { display: none; } }
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="window.print()">Yazdır / PDF kaydet</button>
  <button class="sec" onclick="window.close()">Kapat</button>
</div>
<div class="sheet">
  <header>
    <img src="${logo}" alt="Serhendi Vakfı">
    <div>
      <h1>Serhendi Halkalı</h1>
      <div class="sub">Kumbara teslim makbuzu</div>
    </div>
  </header>
  <div class="no">Makbuz No: ${esc(d.receiptNo)}</div>
  <table>
    <tr><td class="k">Teslim tarihi</td><td>${dateTr(d.handedAt)}</td></tr>
    <tr><td class="k">Teslim eden şube</td><td>${branch}</td></tr>
    <tr><td class="k">Teslim alan</td><td>Merkez yönetici</td></tr>
    <tr><td class="k">Onay tarihi</td><td>${confirmed}</td></tr>
    <tr><td class="k">Durum</td><td>${status}</td></tr>
    ${d.note ? `<tr><td class="k">Not</td><td>${esc(d.note)}</td></tr>` : ''}
  </table>
  <div class="amount">Teslim edilen tutar: ${money(d.amount)}</div>
  <div class="sign">
    <div>Teslim eden (${branch})</div>
    <div>Teslim alan (Merkez)</div>
  </div>
</div>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}
