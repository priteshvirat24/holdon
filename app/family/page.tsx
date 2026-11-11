import FamilyChat from "./FamilyChat";

export const dynamic = "force-dynamic";
export const metadata = { title: "HoldOn · Family chat" };

export default async function Page({ searchParams }: { searchParams: Promise<{ as?: string; embed?: string }> }) {
  const { as, embed } = await searchParams;
  return <FamilyChat initialMemberId={as ?? "mem_priya"} embed={embed === "1"} />;
}
