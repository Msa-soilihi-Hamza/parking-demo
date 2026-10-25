import { TeamShell } from "@/components/shuttle/team-shell";

export const metadata = { title: "Gestion · Escale Parking" };

export default function ManagerLayout({ children }: LayoutProps<"/gestion">) {
  return <TeamShell space="gestion">{children}</TeamShell>;
}
