import { TeamShell } from "@/components/shuttle/team-shell";

export const metadata = { title: "Accueil du parking · Escale Parking" };

export default function FrontDeskLayout({ children }: LayoutProps<"/accueil">) {
  return <TeamShell space="accueil">{children}</TeamShell>;
}
