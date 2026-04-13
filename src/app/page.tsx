import { SkillStoreApp } from "@/components/skill-store-app";
import { getDashboardData } from "@/lib/skillhub";

export const dynamic = "force-dynamic";

export default async function Home() {
  const dashboard = await getDashboardData();

  return <SkillStoreApp initialData={dashboard} />;
}
