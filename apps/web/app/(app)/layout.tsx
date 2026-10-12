"use client";

import { BellIcon, CameraIcon, HomeIcon, LogOutIcon, TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";

import { BrandLogo, BrandWordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { api, useApi } from "@/lib/api";
import { RealtimeProvider } from "@/lib/realtime";

const NAV = [
  { href: "/", label: "Inicio", icon: HomeIcon },
  { href: "/cameras", label: "Unidades", icon: CameraIcon },
  { href: "/events", label: "Eventos", icon: BellIcon },
  { href: "/rentabilidad", label: "Rentabilidad", icon: TrendingUpIcon },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user } = useApi<{ email: string }>("/api/auth/me");

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-1 border-b border-black/5 bg-white p-3 md:w-60 md:border-r md:border-b-0 md:p-4">
        <Link href="/" className="flex items-center gap-2.5 px-2 pb-4 text-xl">
          <BrandLogo size="sm" />
          <BrandWordmark />
        </Link>
        <Suspense fallback={<NavLinks pathname={null} />}>
          <CurrentNavLinks />
        </Suspense>
        {user && (
          <div className="mt-auto hidden flex-col gap-2 border-t border-black/5 pt-3 md:flex">
            <p className="truncate px-2 text-[13px] text-black/45">{user.email}</p>
            <Button variant="ghost" className="justify-start" onClick={logout}>
              <LogOutIcon />
              Cerrar Sesión
            </Button>
          </div>
        )}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-5 md:p-8">
        <RealtimeProvider>
          <Suspense>{children}</Suspense>
        </RealtimeProvider>
      </main>
    </div>
  );
}

function CurrentNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex gap-1 md:flex-col">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="flex items-center gap-3 rounded-full px-3 py-2 text-[15px] font-medium text-black/45 hover:bg-black/5 hover:text-black aria-[current=page]:bg-[#1d7fe0]/10 aria-[current=page]:font-semibold aria-[current=page]:text-[#1d7fe0]"
          >
            <Icon className="size-7" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
