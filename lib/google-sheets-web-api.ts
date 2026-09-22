type GoogleSheetsResult = { ok?: boolean; error?: string };

export async function callGoogleSheetsWebApi<T extends GoogleSheetsResult>(
  action: string,
  payload: Record<string, unknown> = {},
) {
  const endpoint = process.env.GOOGLE_SHEETS_WEB_APP_URL;
  const token = process.env.GOOGLE_SHEETS_API_TOKEN;
  if (!endpoint || !token) throw new Error("Google Sheets connection is not configured on the MedStock server.");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, token, ...payload }),
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Google Apps Script responded with HTTP ${response.status}.`);
  const result = await response.json() as T;
  if (!result.ok) throw new Error(result.error || "Google Sheets rejected the request.");
  return result;
}
