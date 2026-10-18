// Supabase tek seferde en fazla 1000 satır döndürür; bu yardımcı hepsini sayfa sayfa çeker.
export async function fetchAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await run(from, from + 999);
    if (error) throw new Error(error.message);
    // Sorgu tipi ile bizim tipimiz birebir uymayabilir; burada bilerek dönüştürüyoruz
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
