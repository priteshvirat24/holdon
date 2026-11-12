# HoldOn demo video script (target 2:45, hard limit 3:00)

Devpost rules: under 3 minutes, on YouTube and public. It must show the app working. Use no third-party music or trademarks you don't have rights to (PayPal's own button is fine; skip background music, or use a royalty-free track).

## Before recording (10 minutes)

1. Run `npm run dev`, open http://localhost:3000/demo and click **Reset & seed the Sharma family**.
2. Open a second browser window with **Stage view** (`/stage`): Mom's tablet on the left, Priya's phone on the right.
3. Have your **sandbox Personal account** email and password ready for the PayPal popup (developer.paypal.com → Sandbox → Accounts).
4. Do one dry run of each purchase (blood-pressure tablets, massage chair), then click **Reset & seed** again.
5. Record at 1920×1080. Zoom the browser to 110–125% so the text is readable on YouTube.

## Shot list

| Time | Screen | What you do | Voice-over (say roughly this) |
|---|---|---|---|
| 0:00–0:15 | Landing page `/` | Slow scroll | "My siblings and I chip in every month for Mom. Two jobs nobody wants: chasing whoever's late, and stopping Mom from buying from a scam shop. HoldOn is an AI that does both, on PayPal." |
| 0:15–0:40 | `/family` as Anil | Show the Bad Cop nudge, then type "can I pay half now?" | "Every sibling gets a real PayPal invoice. When Anil is late, HoldOn's agent nudges him, first in the group, then with PayPal's own reminder. Anil just asks to pay half, and the agent cancels his invoice and issues two smaller ones." |
| 0:40–0:55 | `/demo` → fast-forward, then the family chat | Click **Fast-forward 3 days ⏩** twice and show the private note to Priya | "If he's still late, it escalates privately to Priya. Nobody had to play bad cop." |
| 0:55–1:20 | Stage view, Mom's side | Tap the mic: "my blood pressure tablets". Pay with PayPal (popup login). | "Mom just talks. She pays with PayPal, but PayPal only *authorizes*: it places a hold. HoldOn checks the pharmacy and the price, and it's normal, so the payment is captured." |
| 1:20–1:55 | Stage view | Mom: "that massage chair from Facebook". Pay with PayPal. | "Now a massage chair, 95% off. PayPal places the hold. HoldOn finds a shop registered nine days ago, a price 5% of the real market, and hidden text on the page telling AI agents to approve. It doesn't obey it, it flags it. Mom hears 'hold on, let me check with Priya'." |
| 1:55–2:10 | Stage view, Priya's side | Priya taps **Decline** | "Priya sees why and taps Decline. The authorization is voided: $0 moved. If nobody answers, the hold voids itself." |
| 2:10–2:25 | `/shop` | Search "massage chair" (or drop in a photo), open a product, show the pre-check and the price history | "It works on real stores too. Channel3 gives HoldOn millions of products. Before Mom pays, HoldOn compares this exact chair across stores and its 90-day price, then the same hold, check and capture." |
| 2:25–2:40 | `/dashboard` | Show the ledger, the chart, the eval strip and "Under the hood" | "Every PayPal call and AI decision lands in the ledger. On 20 labelled purchases, HoldOn caught 10 of 10 scams and wrongly held none of the everyday ones." |
| 2:40–2:50 | Landing or the logo | — | "HoldOn: the family wallet that knows when to say 'hold on'. Built with PayPal and Mistral." |

## Optional extra (if you have time left)

- `/demo` → **Agent: monthly medicine refill**: the agent reorders with Mom's saved PayPal (Vault), with no popup and the same checks.

## Tips

- Cut the PayPal login: pause the recording while you type, or trim it later.
- If the AI check takes a few seconds, cut the wait.
- The first page load after `npm run dev` compiles slowly. Click through every page once before recording.
