# Inbound Email Reply Detection

## Architecture

Inbound replies are detected via a Supabase Edge Function webhook called by the email provider (e.g. SendGrid Inbound Parse).

**Flow:**
1. Lead receives outbound email → `Message-Id` header is saved in `sent_emails` table
2. Recipient replies → email provider POSTs raw MIME to webhook
3. Edge function parses `In-Reply-To` / `References` headers
4. Matches against `sent_emails.message_id` to find the original lead
5. Inserts row into `lead_replies` table
6. Frontend queries `GET /leads/:id/replies` to show reply indicator

## Database Tables

### `sent_emails`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | PK |
| `lead_id` | uuid | FK → leads |
| `message_id` | text | RFC 2822 Message-Id header |
| `subject` | text | Email subject |
| `sent_at` | timestamptz | When sent |

### `lead_replies`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | PK |
| `lead_id` | uuid | FK → leads |
| `sent_email_id` | uuid | FK → sent_emails |
| `from_address` | text | Reply sender |
| `subject` | text | Reply subject |
| `body_text` | text | Plain-text body |
| `body_html` | text | HTML body (nullable) |
| `received_at` | timestamptz | When received |

## API Endpoints

### `GET /leads/:id/replies`
Returns all replies for a lead, newest first.

**Response:**
```json
{
  "replies": [
    {
      "id": "uuid",
      "from_address": "john@example.com",
      "subject": "Re: Let's connect",
      "body_text": "Hi, sure let's talk...",
      "received_at": "2025-04-13T22:00:00Z"
    }
  ]
}
```

## Frontend Integration

### Leads Table (index.tsx)
- Blue "X replies" badge shown on rows where replies exist
- Uses `useLeadReplies(leadId)` hook (batched via React Query)

### Lead Detail ([id].tsx)
- Reply count badge next to email address
- Full reply history shown in dedicated section
- Expandable reply cards with timestamp

## Email Provider Setup (SendGrid)

1. Go to Settings → Inbound Parse
2. Add domain (e.g. `replies.yourdomain.com`)
3. Set webhook URL to your Supabase Edge Function URL
4. Enable "Post Raw MIME" 
5. Add MX record for `replies.yourdomain.com` → `mx.sendgrid.net`

## Supabase Edge Function

Located at `supabase/functions/inbound-email/index.ts`

Parses inbound MIME, extracts In-Reply-To, matches to sent_emails, inserts lead_replies row.
