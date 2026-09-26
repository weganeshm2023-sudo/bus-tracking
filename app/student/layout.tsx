"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const showCreatorButton =
    pathname === "/student/dashboard" || pathname === "/student/creator";

  return (
    <div className="relative min-h-screen">
      {children}

      {showCreatorButton && (
        <Link
          href="/student/creator"
          className="fixed bottom-6 right-6 z-[9999] group"
        >
          <div className="relative flex items-center gap-3 rounded-full border border-white/15 bg-slate-950/90 px-4 py-3 text-white shadow-2xl backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:shadow-cyan-500/20">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-lg shadow-lg">
              👨‍💻
            </div>

            <div className="hidden sm:block">
              <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Created By
              </div>

              <div className="text-sm font-bold">
                Creator Profile
              </div>
            </div>

            <span className="text-cyan-300 transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </div>

          <div className="absolute inset-0 -z-10 rounded-full bg-cyan-400/20 blur-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </Link>
      )}
    </div>
  );
}