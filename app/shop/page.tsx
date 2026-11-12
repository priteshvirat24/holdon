import Shop from "./Shop";
import { paypalMode } from "@/lib/paypal/client";
import { channel3Configured } from "@/lib/risk/signals";

export const dynamic = "force-dynamic";
export const metadata = { title: "HoldOn · Shop" };

export default function Page() {
  return (
    <Shop
      clientId={process.env.PAYPAL_CLIENT_ID ?? ""}
      simulated={paypalMode() === "simulated"}
      channel3={channel3Configured()}
    />
  );
}
