"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Student = {
  id: string;
  studentId: string;
  name: string;
};

type Driver = {
  id: string;
  driverId: string;
  name: string;
};

type Bus = {
  id: string;
  busId: string;
  busNumber: string;
  registration: string;
  status: string;
};

type Stop = {
  id: string;
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
};

type RouteItem = {
  id: string;
  routeId: string;
  name: string;
  stops: Stop[];
};

type StudentAssignment = {
  id: string;
  student: Student;
  bus: Bus;
  route: RouteItem;
  stop: Stop;
  active: boolean;
};

type DriverAssignment = {
  id: string;
  driver: Driver;
  bus: Bus;
  active: boolean;
};

type AssignmentData = {
  students: Student[];
  drivers: Driver[];
  buses: Bus[];
  routes: RouteItem[];
  studentAssignments: StudentAssignment[];
  driverAssignments: DriverAssignment[];
};

export default function AssignmentsPage() {
  const [data, setData] = useState<AssignmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [studentId, setStudentId] = useState("");
  const [studentBusId, setStudentBusId] = useState("");
  const [studentRouteId, setStudentRouteId] = useState("");
  const [studentStopId, setStudentStopId] = useState("");

  const [driverId, setDriverId] = useState("");
  const [driverBusId, setDriverBusId] = useState("");

  /*
   * IMPORTANT:
   * Route select stores the database Route.id.
   * We find the exact same id here.
   */
  const selectedRoute = useMemo<RouteItem | null>(() => {
    if (!data || !studentRouteId) {
      return null;
    }

    return (
      data.routes.find(
        (route) => String(route.id) === String(studentRouteId)
      ) ?? null
    );
  }, [data, studentRouteId]);

  const availableStops = selectedRoute?.stops ?? [];

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/assignments", {
        credentials: "include",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        if (response.status === 401 || response.status === 403) {
          window.location.href = "/admin/login";
          return;
        }

        setError(result.message || "Unable to load assignments.");
        return;
      }

      /*
       * Normalize API data so stops is ALWAYS an array.
       * This prevents the dropdown from breaking if the API
       * returns a route without stops.
       */
      const normalizedData: AssignmentData = {
        students: Array.isArray(result.students)
          ? result.students
          : [],

        drivers: Array.isArray(result.drivers)
          ? result.drivers
          : [],

        buses: Array.isArray(result.buses)
          ? result.buses
          : [],

        routes: Array.isArray(result.routes)
          ? result.routes.map((route: RouteItem) => ({
              ...route,
              stops: Array.isArray(route.stops)
                ? route.stops
                : [],
            }))
          : [],

        studentAssignments: Array.isArray(
          result.studentAssignments
        )
          ? result.studentAssignments
          : [],

        driverAssignments: Array.isArray(
          result.driverAssignments
        )
          ? result.driverAssignments
          : [],
      };

      setData(normalizedData);
    } catch (error) {
      console.error("LOAD_ASSIGNMENTS_ERROR:", error);
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetMessages() {
    setError("");
    setMessage("");
  }

  async function assignStudent() {
    resetMessages();

    if (
      !studentId ||
      !studentBusId ||
      !studentRouteId ||
      !studentStopId
    ) {
      setError(
        "Please select student, bus, route and pickup stop."
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        "/api/admin/assignments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            type: "STUDENT",
            studentId,
            busId: studentBusId,
            routeId: studentRouteId,
            stopId: studentStopId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(
          result.message || "Unable to assign student."
        );
        return;
      }

      setMessage("Student assigned successfully.");

      setStudentId("");
      setStudentBusId("");
      setStudentRouteId("");
      setStudentStopId("");

      await loadData();
    } catch (error) {
      console.error("ASSIGN_STUDENT_ERROR:", error);
      setError("Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  async function assignDriver() {
    resetMessages();

    if (!driverId || !driverBusId) {
      setError("Please select driver and bus.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        "/api/admin/assignments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            type: "DRIVER",
            driverId,
            busId: driverBusId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(
          result.message || "Unable to assign driver."
        );
        return;
      }

      setMessage("Driver assigned successfully.");

      setDriverId("");
      setDriverBusId("");

      await loadData();
    } catch (error) {
      console.error("ASSIGN_DRIVER_ERROR:", error);
      setError("Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(
    type: "STUDENT" | "DRIVER",
    id: string
  ) {
    resetMessages();

    const confirmed = window.confirm(
      type === "STUDENT"
        ? "Remove this student's active bus assignment?"
        : "Remove this driver's active bus assignment?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        "/api/admin/assignments",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            type,
            id,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(
          result.message || "Unable to remove assignment."
        );
        return;
      }

      setMessage(result.message);
      await loadData();
    } catch (error) {
      console.error("REMOVE_ASSIGNMENT_ERROR:", error);
      setError("Unable to connect to the server.");
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = "/admin/login";
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 text-white lg:block">
          <div className="flex h-full flex-col">
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

            <nav className="flex-1 px-3 py-5">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Overview
              </p>

              <Link
                href="/admin/dashboard"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-900"
              >
                Dashboard
              </Link>

              <Link
                href="/admin/buses"
                className="mt-1 block rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-900"
              >
                Buses
              </Link>

              <Link
                href="/admin/drivers"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-900"
              >
                Drivers
              </Link>

              <Link
                href="/admin/routes"
                className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-900"
              >
                Routes & Stops
              </Link>

              <div className="mt-1 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-medium">
                Assignments
              </div>

              <div className="rounded-xl px-3 py-2.5 text-sm text-slate-300">
                Students
              </div>

              <div className="rounded-xl px-3 py-2.5 text-sm text-slate-300">
                Live Tracking
              </div>

              <div className="rounded-xl px-3 py-2.5 text-sm text-slate-300">
                Trips
              </div>

              <div className="rounded-xl px-3 py-2.5 text-sm text-slate-300">
                Notifications
              </div>

              <div className="rounded-xl px-3 py-2.5 text-sm text-slate-300">
                Emergency
              </div>

              <div className="rounded-xl px-3 py-2.5 text-sm text-slate-300">
                Reports
              </div>

              <div className="rounded-xl px-3 py-2.5 text-sm text-slate-300">
                Settings
              </div>
            </nav>
          </div>
        </aside>

        {/* MAIN */}
        <section className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white">
            <div className="flex min-h-20 items-center justify-between gap-4 px-5 sm:px-8">
              <div>
                <p className="text-sm text-slate-500">
                  Transport Configuration
                </p>

                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  Assignments
                </h2>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Logout
              </button>
            </div>
          </header>

          <div className="space-y-6 p-5 sm:p-8">
            {/* SUCCESS */}
            {message && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            )}

            {/* ERROR */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* LOADING */}
            {loading || !data ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
                <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

                <p className="mt-4 text-sm text-slate-500">
                  Loading assignment data...
                </p>
              </div>
            ) : (
              <>
                {/* ASSIGNMENT FORMS */}
                <div className="grid gap-6 xl:grid-cols-2">
                  {/* STUDENT */}
                  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        Student Assignment
                      </p>

                      <h3 className="mt-1 text-xl font-bold">
                        Student → Bus → Route → Stop
                      </h3>

                      <p className="mt-2 text-sm text-slate-500">
                        Assign exactly one active bus route
                        and pickup stop to each student.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {/* STUDENT */}
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Student
                        </label>

                        <select
                          value={studentId}
                          onChange={(event) =>
                            setStudentId(event.target.value)
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                        >
                          <option value="">
                            Select student
                          </option>

                          {data.students.map((student) => (
                            <option
                              key={student.id}
                              value={student.id}
                            >
                              {student.studentId} —{" "}
                              {student.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* BUS */}
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Bus
                        </label>

                        <select
                          value={studentBusId}
                          onChange={(event) =>
                            setStudentBusId(
                              event.target.value
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                        >
                          <option value="">
                            Select bus
                          </option>

                          {data.buses.map((bus) => (
                            <option
                              key={bus.id}
                              value={bus.id}
                            >
                              {bus.busId} — Bus{" "}
                              {bus.busNumber}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* ROUTE */}
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Route
                        </label>

                        <select
                          value={studentRouteId}
                          onChange={(event) => {
                            const nextRouteId =
                              event.target.value;

                            setStudentRouteId(
                              nextRouteId
                            );

                            setStudentStopId("");
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                        >
                          <option value="">
                            Select route
                          </option>

                          {data.routes.map((route) => (
                            <option
                              key={route.id}
                              value={route.id}
                            >
                              {route.routeId} —{" "}
                              {route.name}
                            </option>
                          ))}
                        </select>

                        {/* ROUTE DEBUG / INFO */}
                        {studentRouteId &&
                          selectedRoute && (
                            <p className="mt-2 text-xs text-slate-500">
                              Selected route:{" "}
                              <span className="font-medium text-slate-700">
                                {selectedRoute.name}
                              </span>
                            </p>
                          )}
                      </div>

                      {/* PICKUP STOP */}
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Pickup Stop
                        </label>

                        <select
                          value={studentStopId}
                          onChange={(event) =>
                            setStudentStopId(
                              event.target.value
                            )
                          }
                          disabled={
                            !selectedRoute ||
                            availableStops.length === 0
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">
                            {!studentRouteId
                              ? "Select route first"
                              : !selectedRoute
                              ? "Selected route not found"
                              : availableStops.length === 0
                              ? "No stops added to this route"
                              : "Select pickup stop"}
                          </option>

                          {availableStops.map((stop) => (
                            <option
                              key={stop.id}
                              value={stop.id}
                            >
                              {stop.sequence}. {stop.name}
                            </option>
                          ))}
                        </select>

                        {/* STOP INFO */}
                        {selectedRoute && (
                          <p className="mt-2 text-xs text-slate-500">
                            {availableStops.length}{" "}
                            {availableStops.length === 1
                              ? "stop"
                              : "stops"}{" "}
                            available on{" "}
                            <span className="font-medium text-slate-700">
                              {selectedRoute.name}
                            </span>
                          </p>
                        )}
                      </div>

                      {/* ASSIGN */}
                      <button
                        type="button"
                        onClick={assignStudent}
                        disabled={saving}
                        className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                      >
                        {saving
                          ? "Saving..."
                          : "Assign Student"}
                      </button>
                    </div>
                  </section>

                  {/* DRIVER */}
                  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                        Driver Assignment
                      </p>

                      <h3 className="mt-1 text-xl font-bold">
                        Driver → Bus
                      </h3>

                      <p className="mt-2 text-sm text-slate-500">
                        A driver can have one active bus and
                        each bus can have one active driver.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {/* DRIVER */}
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Driver
                        </label>

                        <select
                          value={driverId}
                          onChange={(event) =>
                            setDriverId(
                              event.target.value
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                        >
                          <option value="">
                            Select driver
                          </option>

                          {data.drivers.map((driver) => (
                            <option
                              key={driver.id}
                              value={driver.id}
                            >
                              {driver.driverId} —{" "}
                              {driver.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* BUS */}
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Bus
                        </label>

                        <select
                          value={driverBusId}
                          onChange={(event) =>
                            setDriverBusId(
                              event.target.value
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
                        >
                          <option value="">
                            Select bus
                          </option>

                          {data.buses.map((bus) => (
                            <option
                              key={bus.id}
                              value={bus.id}
                            >
                              {bus.busId} — Bus{" "}
                              {bus.busNumber}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={assignDriver}
                        disabled={saving}
                        className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {saving
                          ? "Saving..."
                          : "Assign Driver"}
                      </button>
                    </div>
                  </section>
                </div>

                {/* STUDENT ASSIGNMENTS */}
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-6 py-5">
                    <h3 className="font-semibold">
                      Active Student Assignments
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {data.studentAssignments.length}{" "}
                      active assignment
                      {data.studentAssignments.length ===
                      1
                        ? ""
                        : "s"}
                    </p>
                  </div>

                  {data.studentAssignments.length ===
                  0 ? (
                    <div className="px-6 py-12 text-center text-sm text-slate-500">
                      No active student assignments.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[850px] text-left">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-6 py-3">
                              Student
                            </th>
                            <th className="px-6 py-3">
                              Bus
                            </th>
                            <th className="px-6 py-3">
                              Route
                            </th>
                            <th className="px-6 py-3">
                              Pickup Stop
                            </th>
                            <th className="px-6 py-3 text-right">
                              Action
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                          {data.studentAssignments.map(
                            (assignment) => (
                              <tr
                                key={assignment.id}
                                className="hover:bg-slate-50"
                              >
                                <td className="px-6 py-4">
                                  <p className="text-sm font-semibold">
                                    {
                                      assignment.student
                                        .name
                                    }
                                  </p>

                                  <p className="mt-1 text-xs text-slate-400">
                                    {
                                      assignment.student
                                        .studentId
                                    }
                                  </p>
                                </td>

                                <td className="px-6 py-4 text-sm">
                                  {assignment.bus.busId}

                                  <p className="text-xs text-slate-400">
                                    Bus{" "}
                                    {
                                      assignment.bus
                                        .busNumber
                                    }
                                  </p>
                                </td>

                                <td className="px-6 py-4 text-sm">
                                  {assignment.route.routeId}

                                  <p className="text-xs text-slate-400">
                                    {
                                      assignment.route
                                        .name
                                    }
                                  </p>
                                </td>

                                <td className="px-6 py-4 text-sm">
                                  {assignment.stop.name}

                                  <p className="text-xs text-slate-400">
                                    Stop{" "}
                                    {
                                      assignment.stop
                                        .sequence
                                    }
                                  </p>
                                </td>

                                <td className="px-6 py-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeAssignment(
                                        "STUDENT",
                                        assignment.id
                                      )
                                    }
                                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* DRIVER ASSIGNMENTS */}
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-6 py-5">
                    <h3 className="font-semibold">
                      Active Driver Assignments
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {data.driverAssignments.length}{" "}
                      active assignment
                      {data.driverAssignments.length ===
                      1
                        ? ""
                        : "s"}
                    </p>
                  </div>

                  {data.driverAssignments.length ===
                  0 ? (
                    <div className="px-6 py-12 text-center text-sm text-slate-500">
                      No active driver assignments.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[650px] text-left">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-6 py-3">
                              Driver
                            </th>

                            <th className="px-6 py-3">
                              Bus
                            </th>

                            <th className="px-6 py-3">
                              Registration
                            </th>

                            <th className="px-6 py-3 text-right">
                              Action
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                          {data.driverAssignments.map(
                            (assignment) => (
                              <tr
                                key={assignment.id}
                                className="hover:bg-slate-50"
                              >
                                <td className="px-6 py-4">
                                  <p className="text-sm font-semibold">
                                    {
                                      assignment.driver
                                        .name
                                    }
                                  </p>

                                  <p className="mt-1 text-xs text-slate-400">
                                    {
                                      assignment.driver
                                        .driverId
                                    }
                                  </p>
                                </td>

                                <td className="px-6 py-4 text-sm">
                                  {assignment.bus.busId}

                                  <p className="text-xs text-slate-400">
                                    Bus{" "}
                                    {
                                      assignment.bus
                                        .busNumber
                                    }
                                  </p>
                                </td>

                                <td className="px-6 py-4 text-sm text-slate-600">
                                  {
                                    assignment.bus
                                      .registration
                                  }
                                </td>

                                <td className="px-6 py-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeAssignment(
                                        "DRIVER",
                                        assignment.id
                                      )
                                    }
                                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}