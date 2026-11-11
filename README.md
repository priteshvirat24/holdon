# HoldOn

**The family wallet that knows when to say "hold on."**

Siblings chip in every month for Mom. Mom spends. HoldOn is an AI money steward that does both awkward jobs:

- **Bad Cop:** collects everyone's share through PayPal invoices so no sibling ever has to chase another, with AI-written nudges on an escalating ladder and an agent that handles "can I pay half?", "next Friday" or "can Priya cover me?".
- **Guardian:** puts every purchase Mom makes on a real **PayPal authorization hold**, checks the shop (domain age, real market price, the page itself, including hidden instructions aimed at AI agents), then **captures** it, or asks the family and **voids** it on "no". Undecided holds void themselves. Safe by default: if nobody says yes, $0 moves.

- **Agentic refills:** after Mom's first trusted pharmacy purchase, PayPal **Vault** saves her PayPal, and HoldOn's agent reorders her regular medicine on its own, with no popup and no Mom. The agent gets no special powers: its purchase goes through the same hold → check → capture pipeline.

Built for the PayPal AI Hackathon.

**Risk engine scorecard** ([evals/SCORECARD.md](evals/SCORECARD.md), `npm run eval`, 20 labelled purchases):

| Metric | Result |
|---|---|
| Decisions correct | **20/20** |
| Scams held or blocked | **10/10** |
| Everyday purchases wrongly held | **0/7** |
| Hidden AI-agent instructions caught | **2/2**, 0 false positives |

---

## The 60-second story

1. Priya and Raj have paid. Anil hasn't. HoldOn nudges him in the family chat, then through PayPal's invoice reminder, then privately asks Priya whether to cover.
2. Anil replies "can I pay half now?" The agent cancels his PayPal invoice and issues two smaller ones.
3. Anil pays. The fund hits 100% and a **PayPal Payout** sends Mom her allowance.
4. Mom says "my blood-pressure tablets". PayPal authorizes, HoldOn checks (trusted pharmacy, normal price), and it's **captured** instantly.
5. Mom says "that massage chair from Facebook". PayPal authorizes. HoldOn finds a 9-day-old shop, a price 5% of market, and hidden text telling AI agents to approve, so it **holds**. Priya taps Decline, and the **authorization is voided**: $0 moved.

---

## How PayPal is used (sandbox, real API calls)

| Need | PayPal API |
|---|---|
| Mom's guarded purchase | Orders v2 `intent: AUTHORIZE` → `POST /v2/checkout/orders/{id}/authorize` |
| Family approves | `POST /v2/payments/authorizations/{id}/capture` |
| Family declines / nobody answers in 24h / policy block | `POST /v2/payments/authorizations/{id}/void` |
| Monthly shares | Invoicing v2: create → `send` → AI-written `remind` → `cancel` (when split) |
| Sibling pays in-app | Orders v2 `intent: CAPTURE` (PayPal JS SDK buttons) + record the payment on the invoice |
| Mom's allowance | Payouts `POST /v1/payments/payouts` |
| Save Mom's PayPal for agent refills | Vault v3 via Orders (`attributes.vault.store_in_vault: ON_SUCCESS`), then buyer-not-present orders with `payment_source.paypal.vault_id` |
| Source of truth | Webhooks (signature-verified): invoice paid, authorization voided, capture completed, payouts |

Every write carries a stable `PayPal-Request-Id` (idempotent retries), every state change is a conditional update (a double-tapped "Approve" can never capture twice), and every PayPal call is written to the audit log shown on the dashboard.

## How AI is used (Mistral)

| Role | Model | What it does |
|---|---|---|
| Steward agent | `ministral-8b-latest` (tool calls) | Reads the family chat and acts: `split_my_contribution`, `snooze_my_contribution`, `request_cover`, `check_my_contribution`, fund and purchase status |
| Risk judge | `ministral-14b-latest` → `ministral-8b-latest` → `mistral-large-4` | Reads the shop page as **untrusted data**, lists red flags, detects prompt injection, writes a calm message for Mom and a factual one for the family (strict JSON schema) |
| Bad Cop writer | `ministral-14b-latest` | Writes each nudge from context: who, how late, which step of the ladder, what the money is for |
| Mom's voice | `voxtral-mini-latest` (transcription) | Tap-to-talk in Mom Mode (browser speech recognition as fallback); replies are read aloud |

**Safety design:** deterministic rules set the risk floor (domain age, price vs. market, first purchase, per-item limit, blocked categories). The AI can only **add** risk (0–25), never lower it. Only the payment state machine can capture, never the model. Text on shop pages or in chat is treated as data, never instructions.

**Other tools:** Channel3 (real market prices for the price-anomaly check, when a key is set), RDAP (domain registration date, free), AG Grid (family ledger), Telegram (optional mirror of the family chat).

---

## Run it locally (about 5 minutes)

Requirements: Node 20+, a free PayPal Developer account.

```bash
git clone <this repo> holdon && cd holdon
npm install
cp .env.example .env.local
```

1. In **developer.paypal.com → Apps & Credentials → Sandbox**, open (or create) an app and paste its Client ID and Secret into `.env.local` (or run `npm run keys` for a hidden prompt that also tests them).
2. Add a Mistral key (`MISTRAL_API_KEY`). Without one, a transparent offline heuristic is used and the chat agent is disabled.
3. In **Sandbox → Accounts**, copy a *Personal* sandbox account email into `PAYPAL_SANDBOX_MOM_EMAIL` (receives the allowance) and note its password: you'll use it to log in to the PayPal popup as Mom or a sibling.

```bash
npm run dev
```

Open **http://localhost:3000/demo**, click **Reset & seed**, then **Stage view**.

No database to install: locally HoldOn uses embedded Postgres (PGlite) in `.data/`. Set `DATABASE_URL` to use a real Postgres.

### Useful scripts

```bash
npm test
```
State machine, risk rules, nudge ladder and demo stores.

```bash
npm run smoke
```
Live sandbox: real invoice and real AUTHORIZE order, no UI.

```bash
npm run risk-check
```
Runs the risk engine on the four demo shops.

```bash
npm run eval
```
Runs the 20-case scorecard and writes `evals/results.json` and `evals/SCORECARD.md`.

```bash
npm run e2e
```
Runs the full Bad Cop scenario against the running app: every agent tool, all four ladder steps, cover and the allowance payout (25 checks).

```bash
npm run telegram
```
Runs the Telegram bot locally with long polling (set `TELEGRAM_BOT_TOKEN`; in the group send `/link`, then `/iam Priya`).

### Payouts and the sandbox account's country

PayPal only lets some countries send Payouts. If the allowance step says *"You live in a country that is not allowed to send this payout"*, create a **US business** sandbox account (Sandbox → Accounts → Create), link a new REST app to it, and use that app's keys. Everything else works with any sandbox account; the app reports a refused payout in the chat instead of failing.

### Webhooks (optional locally, needed on Render)

PayPal needs a public https URL. After deploying (or with a tunnel), call:

```bash
curl -X POST https://YOUR-APP/api/paypal/setup-webhook -H 'Content-Type: application/json' -d '{"publicUrl":"https://YOUR-APP"}'
```

Put the returned id in `PAYPAL_WEBHOOK_ID`. Without webhooks the app still works: API responses update state directly, and the agent's `check_my_contribution` tool reads invoice status from PayPal.

## Deploy on Render

`render.yaml` defines the web service, a Postgres database and an hourly cron job that runs the Bad Cop ladder and expires undecided holds. Render → New → Blueprint → this repo, then fill in the PayPal and Mistral keys and `APP_URL`.

---

## Screens

| Path | What |
|---|---|
| `/stage` | Mom's tablet and Priya's phone side by side (made for the demo video) |
| `/mom` | Mom Mode: one mic button, huge type, PayPal button, warm spoken status |
| `/family` | The family group chat with approval cards and "pay my share"; switch who you are |
| `/dashboard` | AG Grid ledger, KPIs, and an "under the hood" feed of every PayPal and AI call |
| `/demo` | Reset, fast-forward the family clock (to show the nudge ladder and hold timeouts), run jobs, trigger the agent's monthly refill |
| `/pay/[id]` | A sibling pays their share with PayPal (recorded on the PayPal invoice) |
| `/stores/*` | Fictional demo shops (`.demo` domains), including the scam store with hidden AI instructions |

## Project layout

```
lib/paypal/        PayPal client (token cache, idempotency, audit log) + Orders/Payments/Invoicing/Payouts/Webhooks
lib/state/         Purchase state machine (pure, unit-tested)
lib/flows/         purchases (Guardian), contributions (Bad Cop), card actions
lib/risk/          rules (floor), signals (RDAP, Channel3, page text), judge (Mistral), assess
lib/badcop/        nudge ladder + AI nudge writer
lib/agent/         steward agent (Mistral tool calls)
lib/mistral/       client: model fallbacks, rate-limit handling, JSON schema
app/api/           routes: purchases, cards, chat, contributions, PayPal webhook, cron, demo
```

## Honest limitations and the production path

- **Demo stores settle to the HoldOn sandbox business account,** so HoldOn can capture or void. In production this runs on PayPal's multiparty platform with HoldOn as a partner, or as a checkout guard (browser extension) on any store.
- **The `.demo` shop registration dates are seeded.** Real domains are checked live via RDAP.
- **Money never sits with HoldOn:** it moves only on PayPal's rails, and HoldOn orchestrates.

## License

MIT
