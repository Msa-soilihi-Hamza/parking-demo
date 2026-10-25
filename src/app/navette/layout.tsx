import { TeamShell } from "@/components/shuttle/team-shell";

export const metadata = { title: "Espace navette · Escale Parking" };

export default function ShuttleLayout({ children }: LayoutProps<"/navette">) {
  return <TeamShell space="navette">{children}</TeamShell>;
}
