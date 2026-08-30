import type { Metadata } from "next";
import { Overview } from "@/components/overview/Overview";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: `Overview — ${site.name}`,
  description: "Your position across identity, reputation, and spending authority.",
};

export default function DashboardPage() {
  return <Overview />;
}
