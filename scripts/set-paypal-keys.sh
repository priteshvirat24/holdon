#!/bin/zsh
# Securely store PayPal sandbox credentials in .env.local, then verify them.
# Input is hidden; nothing is echoed or logged.
set -e
ENV_FILE="${0:A:h:h}/.env.local"
[[ -f "$ENV_FILE" ]] || cp "${0:A:h:h}/.env.example" "$ENV_FILE"

echo "HoldOn: PayPal sandbox keys (input is hidden)"
read -rs "CID?Paste PayPal Client ID, then Enter: "; echo
read -rs "SEC?Paste PayPal Secret, then Enter: "; echo

CID="$CID" SEC="$SEC" python3 -I - "$ENV_FILE" <<'PY'
import os, re, sys, json, base64, urllib.request, urllib.error
path = sys.argv[1]
cid, sec = os.environ["CID"].strip(), os.environ["SEC"].strip()
if not cid or not sec:
    sys.exit("✗ One of the values was empty. Nothing saved; run again.")
text = open(path).read()
for key, val in (("PAYPAL_CLIENT_ID", cid), ("PAYPAL_CLIENT_SECRET", sec)):
    if re.search(rf"^{key}=", text, flags=re.M):
        text = re.sub(rf"^{key}=.*$", lambda m: f"{key}={val}", text, flags=re.M)
    else:
        text += f"\n{key}={val}\n"
open(path, "w").write(text)
os.chmod(path, 0o600)
print("✓ Saved to .env.local (permissions 600)")

req = urllib.request.Request(
    "https://api-m.sandbox.paypal.com/v1/oauth2/token",
    data=b"grant_type=client_credentials",
    headers={"Authorization": "Basic " + base64.b64encode(f"{cid}:{sec}".encode()).decode(),
             "Content-Type": "application/x-www-form-urlencoded"})
try:
    body = json.load(urllib.request.urlopen(req, timeout=20))
    scopes = body.get("scope", "")
    feats = [n for n, s in (("Orders/Payments", "checkout"), ("Invoicing", "invoicing"), ("Payouts", "payouts"), ("Vault", "vault")) if s in scopes]
    print("✓ PayPal sandbox accepted the keys. Token received.")
    print("  App features visible in token scope:", ", ".join(feats) or "(none listed)")
except urllib.error.HTTPError as e:
    print(f"✗ PayPal rejected the keys (HTTP {e.code}). Check you copied the SANDBOX Client ID and Secret.")
except Exception as e:
    print("✗ Could not reach PayPal:", type(e).__name__)
PY
unset CID SEC
