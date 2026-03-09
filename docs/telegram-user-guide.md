# desiAgent Telegram Bot — User Guide

## Getting Started

1. **Open the bot** — Search for the desiAgent bot in Telegram and tap **Start**.
2. **Enter your email** — Type the email address you registered with your organization.
3. **Verify with OTP** — A 6-digit code will be sent to your email. Enter it in the chat.
4. **You're ready!** — Once verified, you can start submitting requests.

> If verification fails, send `/start` to restart the process.

## Submitting a Request

Simply type your goal as a plain-text message, e.g.:

> Summarize the latest news about AI

The bot will reply with ⏳ *Processing…* and notify you when the result is ready. Files and artifacts are delivered directly in the chat.

### One Request at a Time

You can only have one active request. Wait for it to complete (or fail) before sending another.

### Clarifications

If the bot needs more information it will ask a follow-up question — just reply with your answer.

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Begin or restart email verification |
| `/profiles` | List available execution profiles |
| `/use <name>` | Switch to a different profile |

> You cannot switch profiles while a request is in progress.

## Tips

- **Rate limits apply** — avoid sending commands or requests too quickly.
- **No slash needed** — regular messages are treated as requests; only use `/` for commands above.
- **Restart anytime** — send `/start` if you get stuck during verification.
