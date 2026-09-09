// Live FX rate lookup via Frankfurter (ECB reference rates) — free, keyless.
// Used as a starting point for a trip currency's rate_to_nis; always
// editable by hand afterward, same as the manual entry it's alongside.

export async function fetchLiveRateToNis(code: string): Promise<number | null> {
  const apiCode = code.toUpperCase() === "NIS" ? "ILS" : code.toUpperCase();
  if (apiCode === "ILS") return 1;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(apiCode)}&to=ILS`);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.ILS;
    return typeof rate === "number" ? rate : null;
  } catch {
    return null;
  }
}
