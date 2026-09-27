import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const adminNav = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: "▦",
  },
  {
    label: "Buses",
    href: "/admin/buses",
    icon: "🚌",
  },
  {
    label: "Drivers",
    href: "/admin/drivers",
    icon: "◉",
  },
  {
    label: "Students",
    href: "/admin/students",
    icon: "●",
  },
  {
    label: "Routes & Stops",
    href: "/admin/routes",
    icon: "⌁",
  },
  {
    label: "Assignments",
    href: "/admin/assignments",
    icon: "↔",
  },
  {
    label: "Trips",
    href: "/admin/trips",
    icon: "▶",
  },
  {
    label: "Live Tracking",
    href: "/admin/live-tracking",
    icon: "⌖",
  },
  {
    label: "Notifications",
    href: "/admin/notifications",
    icon: "♢",
  },
  {
    label: "Emergency",
    href: "/admin/emergency",
    icon: "!",
  },
  {
    label: "Reports",
    href: "/admin/reports",
    icon: "▤",
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: "⚙",
  },
];

export default async function AdminDashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/admin/login");
  }

  if (session.role !== "ADMIN") {
    redirect("/");
  }

  const [
    totalBuses,
    totalStudents,
    totalDrivers,
    runningBuses,
    waitingBuses,
    emergencyBuses,
    liveBuses,
  ] = await Promise.all([
    prisma.bus.count(),

    prisma.student.count(),

    prisma.driver.count(),

    prisma.bus.count({
      where: {
        status: "RUNNING",
      },
    }),

    prisma.bus.count({
      where: {
        status: "WAITING",
      },
    }),

    prisma.bus.count({
      where: {
        status: "EMERGENCY",
      },
    }),

    prisma.bus.findMany({
      orderBy: {
        busNumber: "asc",
      },
      take: 10,
      include: {
        driverAssignments: {
          where: {
            active: true,
          },
          include: {
            driver: true,
          },
          take: 1,
        },

        studentAssignments: {
          where: {
            active: true,
          },
          select: {
            id: true,
          },
        },
      },
    }),
  ]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        {/* =====================================================
            DESKTOP SIDEBAR
        ====================================================== */}
        <aside className="hidden w-72 shrink-0 border-r border-slate-800 bg-slate-950 text-white lg:flex lg:flex-col">
          {/* Brand */}
          <div className="border-b border-slate-800 px-6 py-6">
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-3"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-black">
                BT
              </div>

              <div className="min-w-0">
                <h1 className="truncate font-bold">
                  Bus Tracking
                </h1>

                <p className="text-xs text-slate-400">
                  Administration
                </p>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-5">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Management
            </p>

            <div className="space-y-1">
              {adminNav.map((item) => {
                const active =
                  item.href === "/admin/dashboard";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                      active
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
                        : "text-slate-300 hover:bg-slate-900 hover:text-white",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs",
                        active
                          ? "bg-white/15"
                          : "bg-slate-900 group-hover:bg-slate-800",
                      ].join(" ")}
                    >
                      {item.icon}
                    </span>

                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Account */}
          <div className="border-t border-slate-800 p-4">
            <div className="rounded-2xl bg-slate-900 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Signed in as
              </p>

              <p className="mt-1 truncate text-sm font-semibold">
                {session.username}
              </p>

              <p className="mt-1 text-xs text-blue-400">
                Administrator
              </p>

              <form
                action="/api/auth/logout"
                method="POST"
                className="mt-4"
              >
                <button
                  type="submit"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </aside>

        {/* =====================================================
            MAIN CONTENT
        ====================================================== */}
        <section className="min-w-0 flex-1">
          {/* Mobile / tablet top navigation */}
          <div className="border-b border-slate-200 bg-slate-950 text-white lg:hidden">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <Link
                  href="/admin/dashboard"
                  className="flex min-w-0 items-center gap-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-black">
                    BT
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      Bus Tracking
                    </p>

                    <p className="text-[11px] text-slate-400">
                      Administration
                    </p>
                  </div>
                </Link>

                <form
                  action="/api/auth/logout"
                  method="POST"
                >
                  <button
                    type="submit"
                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-900"
                  >
                    Logout
                  </button>
                </form>
              </div>

              {/* Mobile horizontal navigation */}
              <nav className="mt-4 -mx-1 overflow-x-auto pb-1">
                <div className="flex min-w-max gap-2 px-1">
                  {adminNav.map((item) => {
                    const active =
                      item.href === "/admin/dashboard";

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={[
                          "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition",
                          active
                            ? "bg-blue-600 text-white"
                            : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white",
                        ].join(" ")}
                      >
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </nav>
            </div>
          </div>

          {/* Header */}
          <header className="border-b border-slate-200 bg-white">
            <div className="flex min-h-20 items-center justify-between gap-4 px-5 sm:px-8">
              <div>
                <p className="text-sm text-slate-500">
                  Transport Management
                </p>

                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  Dashboard
                </h2>
              </div>

              <div className="hidden items-center gap-3 sm:flex">
                <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                  Admin Online
                </span>

                <form
                  action="/api/auth/logout"
                  method="POST"
                >
                  <button
                    type="submit"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Logout
                  </button>
                </form>
              </div>
            </div>
          </header>

          <div className="space-y-6 p-5 sm:p-8">
            {/* =================================================
                STATISTICS
            ================================================== */}
            <section>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <StatCard
                  label="Total Buses"
                  value={totalBuses}
                  icon="BUS"
                  tone="blue"
                />

                <StatCard
                  label="Students"
                  value={totalStudents}
                  icon="STU"
                  tone="violet"
                />

                <StatCard
                  label="Drivers"
                  value={totalDrivers}
                  icon="DRV"
                  tone="slate"
                />

                <StatCard
                  label="Running"
                  value={runningBuses}
                  icon="RUN"
                  tone="green"
                />

                <StatCard
                  label="Waiting"
                  value={waitingBuses}
                  icon="WAIT"
                  tone="yellow"
                />

                <StatCard
                  label="Emergency"
                  value={emergencyBuses}
                  icon="!"
                  tone="red"
                />
              </div>
            </section>

            {/* =================================================
                LIVE BUS STATUS
            ================================================== */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h3 className="text-lg font-semibold">
                    Live Bus Status
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Current bus assignments and operating status.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Database connected
                </div>
              </div>

              {liveBuses.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-400">
                    BUS
                  </div>

                  <h4 className="mt-4 font-semibold text-slate-700">
                    No buses added yet
                  </h4>

                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                    Add buses, drivers, routes and assignments from
                    the administration modules.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-semibold">
                          Bus
                        </th>

                        <th className="px-6 py-4 font-semibold">
                          Registration
                        </th>

                        <th className="px-6 py-4 font-semibold">
                          Driver
                        </th>

                        <th className="px-6 py-4 font-semibold">
                          Students
                        </th>

                        <th className="px-6 py-4 font-semibold">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {liveBuses.map((bus) => {
                        const driverAssignment =
                          bus.driverAssignments[0];

                        return (
                          <tr
                            key={bus.id}
                            className="transition hover:bg-slate-50"
                          >
                            <td className="px-6 py-4">
                              <div>
                                <p className="font-semibold">
                                  BUS {bus.busNumber}
                                </p>

                                <p className="mt-0.5 text-xs text-slate-400">
                                  {bus.busId}
                                </p>
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <span className="text-sm">
                                {bus.registration}
                              </span>
                            </td>

                            <td className="px-6 py-4">
                              <span className="text-sm">
                                {driverAssignment?.driver?.name ??
                                  "Not assigned"}
                              </span>
                            </td>

                            <td className="px-6 py-4">
                              <span className="font-medium">
                                {bus.studentAssignments.length}
                              </span>
                            </td>

                            <td className="px-6 py-4">
                              <StatusBadge
                                status={bus.status}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* =================================================
                SYSTEM STATUS
            ================================================== */}
            <section className="grid gap-4 md:grid-cols-3">
              <SystemCard
                title="Authentication"
                value="Protected"
                description="Role-based session authentication is enabled."
              />

              <SystemCard
                title="Database"
                value="Connected"
                description="Dashboard statistics are loaded from PostgreSQL."
              />

              <SystemCard
                title="Realtime"
                value="Socket.IO"
                description="Live GPS tracking is available through the realtime tracking service."
              />
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: string;
  tone:
    | "blue"
    | "violet"
    | "slate"
    | "green"
    | "yellow"
    | "red";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    slate: "bg-slate-100 text-slate-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    red: "bg-red-50 text-red-600",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-3xl font-bold tracking-tight">
            {value}
          </p>
        </div>

        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-[10px] font-bold ${tones[tone]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status:
    | "WAITING"
    | "RUNNING"
    | "EMERGENCY"
    | "OFFLINE"
    | "INACTIVE";
}) {
  const config = {
    WAITING: {
      label: "Waiting",
      className:
        "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
    },

    RUNNING: {
      label: "Running",
      className:
        "bg-green-50 text-green-700 ring-green-600/20",
    },

    EMERGENCY: {
      label: "Emergency",
      className:
        "bg-red-50 text-red-700 ring-red-600/20",
    },

    OFFLINE: {
      label: "Offline",
      className:
        "bg-slate-100 text-slate-600 ring-slate-500/20",
    },

    INACTIVE: {
      label: "Inactive",
      className:
        "bg-slate-100 text-slate-600 ring-slate-500/20",
    },
  };

  const item = config[status];

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${item.className}`}
    >
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
      {item.label}
    </span>
  );
}

function SystemCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-lg font-semibold">
        {value}
      </p>

      <p className="mt-1 text-sm leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}