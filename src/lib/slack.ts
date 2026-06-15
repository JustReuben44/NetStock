export async function sendSlackMessage(text: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) { console.error("SLACK_WEBHOOK_URL not set"); return false; }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) console.error("Slack webhook error:", await res.text());
  return res.ok;
}
