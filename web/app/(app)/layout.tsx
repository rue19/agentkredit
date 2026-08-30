import { AppShell } from "@/components/app/AppShell";

/*
  Every authenticated route renders inside the shell. The route group keeps
  the URLs flat: this file wraps /dashboard, and the pages later sprints add.
*/
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
