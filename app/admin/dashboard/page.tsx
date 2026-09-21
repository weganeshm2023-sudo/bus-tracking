import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 text-white lg:block">
          <div className="flex h-full flex-col">
            {/* Brand */}
            <div className="border-b border-slate-800 px-6 py-6">
              <Link
                href="/admin/dashboard"
                className="flex items-center gap-3"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-bold">
                  BT
                </div>

                <div>
                  <h1 className="font-semibold">
                    Bus Tracking
                  </h1>

                  <p className="text-xs text-slate-400">
                    Administration
                  </p>
                </div>
              </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-5">
              <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Overview
              </div>

              {/* Dashboard */}
              <Link
                href="/admin/dashboard"
                className="block rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-medium transition hover:bg-blue-500"
              >
                Dashboard
              </Link>

              {/* Buses */}
              <Link
                href="/admin/buses"
                className="mt-1 block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Buses
              </Link>

              {/* Drivers */}
              <Link
                href="/admin/drivers"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Drivers
              </Link>

              {/* Students */}
              <Link
                href="/admin/students"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Students
              </Link>

              {/* Routes */}
              <Link
                href="/admin/routes"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Routes & Stops
              </Link>

              {/* Assignments */}
              <Link
                href="/admin/assignments"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Assignments
              </Link>

              {/* Live Tracking */}
              <Link
                href="/admin/live-tracking"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Live Tracking
              </Link>

              {/* Trips */}
              <Link
                href="/admin/trips"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Trips
              </Link>

              {/* Notifications */}
              <Link
                href="/admin/notifications"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Notifications
              </Link>

              {/* Emergency */}
              <Link
                href="/admin/emergency"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Emergency
              </Link>

              {/* Reports */}
              <Link
                href="/admin/reports"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Reports
              </Link>

              {/* Settings */}
              <Link
                href="/admin/settings"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                Settings
              </Link>
            </nav>

            {/* Signed-in user */}
            <div className="border-t border-slate-800 p-4">
              <div className="rounded-xl bg-slate-900 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Signed in as
                </p>

                <p className="mt-1 truncate text-sm font-medium">
                  {session.username}
                </p>

                <p className="mt-1 text-xs text-blue-400">
                  Administrator
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <section className="min-w-0 flex-1">
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
          </header>

          <div className="space-y-6 p-5 sm:p-8">
            {/* Statistics */}
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

            {/* Live Bus Status */}
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

            {/* System Status */}
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
                value="Preparing"
                description="Live GPS and Socket.IO tracking will be connected next."
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