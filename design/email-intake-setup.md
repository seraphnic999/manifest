# Booking-email intake setup

Manifest doesn't run a mail server, so a forwarded booking email needs an external
inbound-email provider to receive it and hand it to
`parse-booking-email` (the edge function that turns it into a reviewable
proposal). This is the one part of the feature that needs your action —
everything else (the edge function, the DB table, the notification, the
review screen) is already built and deployed.

## SendGrid Inbound Parse on a subdomain of bakery365.co.il

You already have Google Workspace on `bakery365.co.il` (one mailbox, and a
second one is $84/year). You don't need a second Workspace mailbox for
this — a **subdomain** can have its own MX record pointing somewhere else
entirely, without touching Workspace's existing mail routing for the root
domain. That gets you a real address like `anything@mail.bakery365.co.il`
for free, forever, via SendGrid's Inbound Parse (a free feature of any
SendGrid account — no paid plan needed, unlike CloudMailin's free tier
which can't receive at a custom domain).

**Steps:**

1. Sign up at [sendgrid.com](https://signup.sendgrid.com/) (free account).
2. In the dashboard, go to **Settings → Inbound Parse** and click
   **Add Host & URL**.
3. Fill in:
   - **Subdomain**: `mail` — **Domain**: `bakery365.co.il` (together, `mail.bakery365.co.il`)
   - **Destination URL**:
     ```
     https://yvqptrjxbptloucyuubm.supabase.co/functions/v1/parse-booking-email?token=<EMAIL_WEBHOOK_SECRET>
     ```
     (the real secret value is below — treat it like a password, it's the
     only thing stopping a stranger from posting fake "bookings" into your
     queue)
   - Leave "POST the raw, full MIME message" **unchecked** — we want the
     parsed fields (default).
4. Save. SendGrid will show an **MX record** to add — something like:
   ```
   Host:     mail.bakery365.co.il
   Type:     MX
   Priority: 10
   Value:    mx.sendgrid.net
   ```
   Add that in the DNS Zone panel that actually manages `bakery365.co.il`
   (the Internic/sitesdepot.com panel you're using — not WordPress.com's own
   UI). This does **not** touch the existing `@bakery365.co.il` MX records
   Workspace uses — it's scoped to the subdomain only.
5. Once DNS propagates (usually well under an hour, sometimes a few hours),
   forward a booking confirmation email to your new address (e.g.
   `anything@mail.bakery365.co.il` — SendGrid Inbound Parse on a custom
   domain accepts any local part) and check the **Email Proposals** screen
   in Manifest (or wait for the push notification).

## Secrets to add (Supabase Dashboard → Project Settings → Edge Functions → Secrets)

I can't set these myself — no Supabase CLI session or dashboard access from
here. Two values, both already generated:

| Secret | Value |
| --- | --- |
| `EMAIL_WEBHOOK_SECRET` | `48f9e5aa89eae44515b46d4ca0b395121d3c9e1ef5c3aa61` |
| `MANIFEST_OWNER_USER_ID` | `027c3ff2-90b0-4a4c-ab90-b96afebea27c` |

(`ANTHROPIC_API_KEY` is already set on this project from the existing research
agent — `parse-booking-email` reuses it, nothing new needed there.)

## Testing without a real inbound email yet

Once the two secrets above are set, this works right now via curl, before
any DNS/SendGrid setup — useful to confirm the pipeline itself end to end
(this sends plain JSON, which the function also accepts, though the real
SendGrid webhook posts multipart/form-data):

```bash
curl -X POST "https://yvqptrjxbptloucyuubm.supabase.co/functions/v1/parse-booking-email?token=48f9e5aa89eae44515b46d4ca0b395121d3c9e1ef5c3aa61" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "noreply@airline.example.com",
    "subject": "Your booking confirmation",
    "text": "Your flight LY393 from Tel Aviv to Paris departs 28/10/2026 at 09:15. Confirmation code: ABC123."
  }'
```

Then check the Email Proposals screen (or `select * from email_proposals
order by created_at desc limit 1` in the Supabase SQL editor) for the
result.

## If you'd rather not set up SendGrid right now

That's fine — nothing else depends on it. The queue screen just stays empty
until a first email comes through. Revisit this doc whenever you're ready.
