# Telegram Integration — Admin Setup Guide

## 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts to choose a name and username.
3. BotFather will give you a **bot token** (e.g. `123456:ABC-DEF...`). Save it securely.

## 2. Configure Environment Variables

Add the following to your `.env` file:

```env
# Required
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# Tenant that Telegram users are mapped to
TELEGRAM_DEFAULT_TENANT_ID=default

# Webhook secret — a random string you choose (validated on incoming requests)
TELEGRAM_WEBHOOK_SECRET=my-random-secret-string

# Optional: tune polling behavior for execution results
TELEGRAM_POLL_INTERVAL_MS=5000     # How often to check execution status (default: 5s)
TELEGRAM_POLL_TIMEOUT_MS=300000    # Max wait before giving up (default: 5 min)
```

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from BotFather |
| `TELEGRAM_DEFAULT_TENANT_ID` | ✅ | Tenant ID for Telegram users (default: `default`) |
| `TELEGRAM_WEBHOOK_SECRET` | Recommended | Secret token to validate incoming webhooks |
| `TELEGRAM_POLL_INTERVAL_MS` | No | Execution polling interval in ms |
| `TELEGRAM_POLL_TIMEOUT_MS` | No | Execution polling timeout in ms |

## 3. Register the Webhook with Telegram

Once your server is running and publicly accessible, register the webhook:

```bash
BOT_TOKEN="<your-bot-token>"
WEBHOOK_URL="https://your-domain.com/api/v2/telegram/webhook"
SECRET="<your-webhook-secret>"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${WEBHOOK_URL}\",
    \"secret_token\": \"${SECRET}\"
  }"
```

Verify the webhook is set:

```bash
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

> **Note:** The webhook URL must be HTTPS. Telegram cannot reach `localhost` directly.

### Local Development with ngrok

If your server runs locally (e.g. `localhost:3000`), use [ngrok](https://ngrok.com) to create a public HTTPS tunnel:

```bash
# 1. Start the tunnel
ngrok http 3000

# 2. ngrok will display a forwarding URL like:
#    https://abc123.ngrok-free.app → http://localhost:3000

# 3. Use that URL to set the webhook
BOT_TOKEN="<your-bot-token>"
SECRET="<your-webhook-secret>"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"https://abc123.ngrok-free.app/api/v2/telegram/webhook\",
    \"secret_token\": \"${SECRET}\"
  }"
```

> ⚠️ The ngrok URL changes every time you restart ngrok (on the free plan). You'll need to re-register the webhook each time.

## 4. Ensure the Tenant Exists

Telegram users are mapped to `TELEGRAM_DEFAULT_TENANT_ID`. Make sure that tenant is bootstrapped:

```bash
# If using the default tenant, just bootstrap normally:
bun run bootstrap-admin

# Or create a specific tenant:
bash scripts/01-create-tenant.sh myorg free
```

Users who register via the bot must already have an account (email) in this tenant. Create users with:

```bash
bash scripts/02-create-user.sh user@example.com "User Name" myorg member
```

## 5. Share the Bot Link

Give your users the direct link to start chatting:

```
https://t.me/<your_bot_username>
```

To find your bot's username:

```bash
curl "https://api.telegram.org/bot${BOT_TOKEN}/getMe"
```

## 6. How It Works

```
User → Telegram → Webhook (POST /api/v2/telegram/webhook)
                     ↓
              Verify secret token
                     ↓
              Identify user (by Telegram user ID)
                     ↓
         ┌── New user? → Onboarding (email + OTP)
         └── Verified? → Route message to profile handler
                              ↓
                     Create DAG → Execute → Poll for results
                              ↓
                     Send results + artifacts back to chat
```

## 7. Rate Limits

Built-in rate limits protect against abuse:

| Category | Limit |
|----------|-------|
| Webhook (per chat) | 60/min |
| Commands (per user) | 30/min |
| Request submissions (per user) | 10/min |
| Verification attempts (per user) | 5 per 15 min |

## 8. Artifact Delivery

- Files **≤ 50 MB** are sent directly in the Telegram chat.
- Files **> 50 MB** are served via a signed download link (`/api/v2/telegram/download/:token`) valid for 1 hour.

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot doesn't respond | Check `TELEGRAM_BOT_TOKEN` is set and server is running |
| Webhook not receiving updates | Verify with `getWebhookInfo`; ensure HTTPS URL is reachable |
| "TELEGRAM_BOT_TOKEN not configured" in logs | Add the token to `.env` and restart |
| Users can't verify | Ensure the user's email exists in the tenant (`scripts/02-create-user.sh`) |
| Webhook returns 200 but silently drops | Check `TELEGRAM_WEBHOOK_SECRET` matches the `secret_token` set in `setWebhook` |
