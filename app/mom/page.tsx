import MomMode from "./MomMode";

export const dynamic = "force-dynamic";
export const metadata = { title: "HoldOn · Mom Mode" };

export default async function Page({ searchParams }: { searchParams: Promise<{ embed?: string }> }) {
  const { embed } = await searchParams;
  return <MomMode clientId={process.env.PAYPAL_CLIENT_ID ?? ""} embed={embed === "1"} />;
}
