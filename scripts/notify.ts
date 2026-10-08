/** Push-Nachricht aufs Handy über ntfy.sh (kostenlos, ohne Konto). Aktiv nur, wenn NTFY_TOPIC gesetzt ist. */
export async function notify(title: string, message: string, priority: 1 | 2 | 3 | 4 | 5 = 3) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Title: encodeURIComponent(title).replace(/%20/g, ' '), Priority: String(priority), Tags: 'chart_with_upwards_trend' },
      body: message,
    });
  } catch {
    /* Benachrichtigung ist optional */
  }
}
