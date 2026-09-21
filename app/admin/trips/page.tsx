"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Driver = {
  id: string;
  driverId: string;
  name: string;
};

type Route = {
  id: string;
  routeId: string;
  name: string;
  stops: Array<{
    id: string;
    stopId: string;
    name: string;
    sequence: number;
    latitude: number;
    longitude: number;
  }>;
};

type Bus = {
  id: string;
  busId: string;
  busNumber: string;
  registration: string;
  status: string;
  driverAssignments: Array<{
    driverId: string;
    driver: Driver;
  }>;
  studentAssignments: Array<{
    id: string;
    route: {
      id: string;
      routeId: string;
      name: string;
    };
  }>;
};

type Trip = {
  id: string;
  tripId: string;
  status: "SCHEDULED" | "RUNNING" | "COMPLETED" | "CANCELLED";
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  bus: Bus;
  driver: Driver;
  route: Route;
};

type ApiResponse = {
  success?: boolean;
  message?: string;
  trips?: Trip[];
  buses?: Bus[];
  drivers?: Driver[];
  routes?: Route[];
};

export default function AdminTripsPage() {
  const router = useRouter();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);

  const [busId, setBusId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [routeId, setRouteId] = useState("");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingTripId, setUpdatingTripId] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/trips", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      const data: ApiResponse = await response.json();

      if (response.status === 401) {
        setError(
          "Admin session expired. Please sign in again."
        );

        setTimeout(() => {
          router.replace("/admin/login");
        }, 700);

        return;
      }

      if (response.status === 403) {
        setError("Admin access required.");

        setTimeout(() => {
          router.replace("/admin/dashboard");
        }, 700);

        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load trip data."
        );
      }

      setTrips(Array.isArray(data.trips) ? data.trips : []);
      setBuses(Array.isArray(data.buses) ? data.buses : []);
      setDrivers(
        Array.isArray(data.drivers) ? data.drivers : []
      );
      setRoutes(
        Array.isArray(data.routes) ? data.routes : []
      );
    } catch (err) {
      console.error("ADMIN_TRIPS_LOAD_ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load trip data."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedBus = useMemo(() => {
    if (!busId) {
      return null;
    }

    return (
      buses.find(
        (bus) => String(bus.id) === String(busId)
      ) ?? null
    );
  }, [buses, busId]);

  const assignedDrivers = useMemo(() => {
    if (!selectedBus) {
      return [];
    }

    return selectedBus.driverAssignments
      .map((assignment) => assignment.driver)
      .filter(Boolean);
  }, [selectedBus]);

  const availableRoutes = useMemo(() => {
    if (!selectedBus) {
      return [];
    }

    const routeIds = new Set(
      selectedBus.studentAssignments.map(
        (assignment) => String(assignment.route.id)
      )
    );

    return routes.filter((route) =>
      routeIds.has(String(route.id))
    );
  }, [selectedBus, routes]);

  useEffect(() => {
    if (!selectedBus) {
      setDriverId("");
      setRouteId("");
      return;
    }

    const firstDriver = assignedDrivers[0];

    setDriverId(
      firstDriver ? String(firstDriver.id) : ""
    );

    if (availableRoutes.length === 1) {
      setRouteId(String(availableRoutes[0].id));
    } else if (
      routeId &&
      availableRoutes.some(
        (route) => String(route.id) === String(routeId)
      )
    ) {
      // Keep the currently selected route.
    } else {
      setRouteId("");
    }
  }, [selectedBus, assignedDrivers, availableRoutes, routeId]);

  function handleBusChange(value: string) {
    setMessage("");
    setError("");
    setBusId(value);
  }

  async function createTrip() {
    setMessage("");
    setError("");

    if (!busId) {
      setError("Please select a bus.");
      return;
    }

    if (!driverId) {
      setError(
        "No active driver is assigned to this bus."
      );
      return;
    }

    if (!routeId) {
      setError(
        "Please select a route assigned to this bus."
      );
      return;
    }

    try {
      setCreating(true);

      const response = await fetch("/api/admin/trips", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          busId,
          driverId,
          routeId,
        }),
      });

      const data: ApiResponse = await response.json();

      if (response.status === 401) {
        setError("Admin session expired. Please sign in again.");
        setTimeout(() => {
          router.replace("/admin/login");
        }, 700);
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to create trip."
        );
      }

      setMessage(
        data.message || "Trip created successfully."
      );

      setBusId("");
      setDriverId("");
      setRouteId("");

      await loadData();
    } catch (err) {
      console.error("CREATE_TRIP_ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to create trip."
      );
    } finally {
      setCreating(false);
    }
  }

  async function updateTrip(
    tripId: string,
    status: "RUNNING" | "COMPLETED" | "CANCELLED"
  ) {
    setMessage("");
    setError("");

    try {
      setUpdatingTripId(tripId);

      const response = await fetch("/api/admin/trips", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          id: tripId,
          status,
        }),
      });

      const data: ApiResponse = await response.json();

      if (response.status === 401) {
        setError("Admin session expired. Please sign in again.");
        setTimeout(() => {
          router.replace("/admin/login");
        }, 700);
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to update trip."
        );
      }

      setMessage(
        data.message || "Trip updated successfully."
      );

      await loadData();
    } catch (err) {
      console.error("UPDATE_TRIP_ERROR:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to update trip."
      );
    } finally {
      setUpdatingTripId("");
    }
  }

  const scheduledCount = trips.filter(
    (trip) => trip.status === "SCHEDULED"
  ).length;

  const runningCount = trips.filter(
    (trip) => trip.status === "RUNNING"
  ).length;

  const completedCount = trips.filter(
    (trip) => trip.status === "COMPLETED"
  ).length;

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex min-h-20 items-center justify-between px-5 lg:px-8">
          <div>
            <p className="text-sm font-semibold text-blue-600">
              Bus Tracking
            </p>

            <h1 className="text-xl font-bold text-slate-900">
              Trips
            </h1>
          </div>

          <button
            onClick={async () => {
              await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "include",
              });

              router.replace("/admin/login");
            }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
          <div className="sticky top-0 p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Administration
            </p>

            <nav className="space-y-1">
              <NavLink href="/admin/dashboard">
                Dashboard
              </NavLink>

              <NavLink href="/admin/buses">
                Buses
              </NavLink>

              <NavLink href="/admin/drivers">
                Drivers
              </NavLink>

              <NavLink href="/admin/students">
                Students
              </NavLink>

              <NavLink href="/admin/routes">
                Routes & Stops
              </NavLink>

              <NavLink href="/admin/assignments">
                Assignments
              </NavLink>

              <NavLink href="/admin/live-tracking">
                Live Tracking
              </NavLink>

              <NavLink
                href="/admin/trips"
                active
              >
                Trips
              </NavLink>

              <NavLink href="/admin/notifications">
                Notifications
              </NavLink>

              <NavLink href="/admin/emergency">
                Emergency
              </NavLink>

              <NavLink href="/admin/reports">
                Reports
              </NavLink>

              <NavLink href="/admin/settings">
                Settings
              </NavLink>
            </nav>
          </div>
        </aside>

        <section className="min-w-0 flex-1 p-5 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-7">
              <p className="text-sm font-medium text-blue-600">
                Daily Operations
              </p>

              <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                Trips
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Create and manage daily bus journeys.
              </p>
            </div>

            {message && (
              <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-medium text-green-700">
                {message}
              </div>
            )}

            {error && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <div className="mb-7 grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Scheduled"
                value={scheduledCount}
              />

              <StatCard
                label="Running"
                value={runningCount}
              />

              <StatCard
                label="Completed"
                value={completedCount}
              />
            </div>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">
                  Create Trip
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Select a configured bus. Its assigned
                  driver and route will be loaded
                  automatically.
                </p>
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Bus
                  </span>

                  <select
                    value={busId}
                    onChange={(event) =>
                      handleBusChange(event.target.value)
                    }
                    disabled={loading}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">
                      {loading
                        ? "Loading buses..."
                        : buses.length === 0
                        ? "No buses available"
                        : "Select bus"}
                    </option>

                    {buses.map((bus) => (
                      <option
                        key={bus.id}
                        value={bus.id}
                      >
                        {bus.busId} — Bus {bus.busNumber}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Assigned Driver
                  </span>

                  <div className="min-h-[48px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    {!selectedBus ? (
                      <p className="text-sm text-slate-400">
                        Select bus first
                      </p>
                    ) : assignedDrivers.length === 0 ? (
                      <p className="text-sm font-medium text-red-600">
                        No active driver assigned
                      </p>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {assignedDrivers[0].driverId} —{" "}
                          {assignedDrivers[0].name}
                        </p>

                        <p className="mt-0.5 text-xs font-medium text-green-600">
                          ✓ Active bus assignment
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">
                    Route
                  </span>

                  <select
                    value={routeId}
                    onChange={(event) =>
                      setRouteId(event.target.value)
                    }
                    disabled={!selectedBus}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="">
                      {!selectedBus
                        ? "Select bus first"
                        : availableRoutes.length === 0
                        ? "No assigned route"
                        : "Select route"}
                    </option>

                    {availableRoutes.map((route) => (
                      <option
                        key={route.id}
                        value={route.id}
                      >
                        {route.routeId} — {route.name}
                      </option>
                    ))}
                  </select>

                  {selectedBus &&
                    availableRoutes.length === 0 && (
                      <p className="mt-2 text-xs text-red-600">
                        No active student assignment
                        connects this bus to a route.
                      </p>
                    )}
                </label>
              </div>

              {selectedBus && (
                <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
                  <SummaryItem
                    label="Bus"
                    value={`${selectedBus.busId} — Bus ${selectedBus.busNumber}`}
                  />

                  <SummaryItem
                    label="Driver"
                    value={
                      assignedDrivers[0]
                        ? `${assignedDrivers[0].driverId} — ${assignedDrivers[0].name}`
                        : "Not assigned"
                    }
                  />

                  <SummaryItem
                    label="Route"
                    value={
                      routeId
                        ? availableRoutes.find(
                            (route) =>
                              String(route.id) ===
                              String(routeId)
                          )?.name ?? "Not selected"
                        : "Not selected"
                    }
                  />
                </div>
              )}

              <div className="mt-6">
                <button
                  onClick={createTrip}
                  disabled={
                    creating ||
                    loading ||
                    !busId ||
                    !driverId ||
                    !routeId
                  }
                  className="rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {creating
                    ? "Creating..."
                    : "Create Trip"}
                </button>
              </div>
            </section>

            <section className="mt-7 rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900">
                  Trip History
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {trips.length} total trip
                  {trips.length === 1 ? "" : "s"}
                </p>
              </div>

              {loading ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Loading trips...
                </div>
              ) : trips.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="font-semibold text-slate-800">
                    No trips yet
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Create the first daily trip above.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {trips.map((trip) => (
                    <div
                      key={trip.id}
                      className="p-6"
                    >
                      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr_1fr_1fr_auto] xl:items-center">
                        <div>
                          <p className="font-bold text-slate-900">
                            {trip.tripId}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {new Date(
                              trip.createdAt
                            ).toLocaleString()}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">
                            Bus
                          </p>

                          <p className="mt-1 font-semibold text-slate-800">
                            {trip.bus.busId}
                          </p>

                          <p className="text-xs text-slate-500">
                            Bus {trip.bus.busNumber}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">
                            Driver
                          </p>

                          <p className="mt-1 font-semibold text-slate-800">
                            {trip.driver.name}
                          </p>

                          <p className="text-xs text-slate-500">
                            {trip.driver.driverId}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">
                            Route
                          </p>

                          <p className="mt-1 font-semibold text-slate-800">
                            {trip.route.name}
                          </p>

                          <p className="text-xs text-slate-500">
                            {trip.route.routeId}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            status={trip.status}
                          />

                          {trip.status ===
                            "SCHEDULED" && (
                            <button
                              disabled={
                                updatingTripId ===
                                trip.id
                              }
                              onClick={() =>
                                updateTrip(
                                  trip.id,
                                  "RUNNING"
                                )
                              }
                              className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              Start
                            </button>
                          )}

                          {trip.status ===
                            "RUNNING" && (
                            <>
                              <button
                                disabled={
                                  updatingTripId ===
                                  trip.id
                                }
                                onClick={() =>
                                  updateTrip(
                                    trip.id,
                                    "COMPLETED"
                                  )
                                }
                                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                Complete
                              </button>

                              <button
                                disabled={
                                  updatingTripId ===
                                  trip.id
                                }
                                onClick={() =>
                                  updateTrip(
                                    trip.id,
                                    "CANCELLED"
                                  )
                                }
                                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function NavLink({
  href,
  children,
  active = false,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-3xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: Trip["status"];
}) {
  const styles = {
    SCHEDULED:
      "bg-yellow-50 text-yellow-700 border-yellow-200",
    RUNNING:
      "bg-green-50 text-green-700 border-green-200",
    COMPLETED:
      "bg-blue-50 text-blue-700 border-blue-200",
    CANCELLED:
      "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}