import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LogoutButton } from "@/components/shuttle/logout-button";
import { ShuttleNav } from "@/components/shuttle/shuttle-nav";
import { ShuttleLogin } from "@/components/shuttle-login";
import { Skeleton } from "@/components/ui/skeleton";
import { hasShuttleAccess } from "@/server/shuttle-access";

export const metadata = { title: "Espace navette · Escale Parking" };

// The shuttle team's tool: its own minimal top bar, no public header or footer.
export default function ShuttleLayout({ children }: LayoutProps<"/navette">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-[600px]" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  await connection();
  if (!(await hasShuttleAccess())) {
    return (
      <main className="grid flex-1 place-items-center px-4 py-16">
        <ShuttleLogin />
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        {/* Phones: logo + logout on the first row, the tabs on a second row. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 sm:h-14 sm:flex-nowrap sm:px-6 sm:py-0">
          <Link href="/navette" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="size-2.5 rounded-full bg-primary" aria-hidden />
            Escale <span className="font-normal text-muted-foreground">· Navette</span>
          </Link>
          <div className="order-last w-full sm:order-none sm:w-auto">
            <ShuttleNav />
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
