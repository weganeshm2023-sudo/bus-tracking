"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Skill = {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
};

type Project = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  projectUrl: string | null;
  githubUrl: string | null;
  techStack: string | null;
  featured: boolean;
  sortOrder: number;
};

type CreatorProfile = {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  college: string | null;
  company: string | null;

  photoUrl: string | null;
  companyLogoUrl: string | null;

  about: string | null;
  education: string | null;

  email: string | null;
  github: string | null;
  linkedin: string | null;
  instagram: string | null;
  portfolio: string | null;

  skills: Skill[];
  projects: Project[];
};

type ApiResponse = {
  success: boolean;
  message?: string;
  profile: CreatorProfile | null;
};

const fallbackProjects = [
  {
    title: "Live Bus Tracking System",
    description:
      "A real-time student bus tracking platform with live GPS, driver tracking, student notifications and route monitoring.",
  },
  {
    title: "Smart Garbage Monitoring",
    description:
      "An intelligent monitoring platform using computer vision, real-time communication and Tamil voice alerts.",
  },
  {
    title: "Bus Booking Platform",
    description:
      "A modern bus booking platform with route search, seat selection, authentication and booking workflows.",
  },
];

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "D";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function normalizeUrl(url: string | null) {
  if (!url) {
    return "";
  }

  const value = url.trim();

  if (!value) {
    return "";
  }

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("mailto:")
  ) {
    return value;
  }

  return `https://${value}`;
}

export default function StudentCreatorPage() {
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCreatorProfile() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/student/creator", {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        });

        const data: ApiResponse = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok || !data.success || !data.profile) {
          setProfile(null);
          setError(
            data.message ||
              "Creator profile has not been configured yet."
          );
          return;
        }

        setProfile(data.profile);
      } catch (requestError) {
        console.error("CREATOR_PROFILE_LOAD_ERROR:", requestError);

        if (!cancelled) {
          setProfile(null);
          setError(
            "Unable to load the Creator Profile. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCreatorProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const initials = useMemo(() => {
    return getInitials(profile?.name || "Developer");
  }, [profile?.name]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] text-white">
        <div className="relative min-h-screen overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.16),transparent_30%),linear-gradient(180deg,#050816_0%,#08111f_50%,#050816_100%)]" />

          <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-5">
            <div className="text-center">
              <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />

              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">
                Creator Profile
              </p>

              <h1 className="mt-3 text-2xl font-black tracking-tight">
                Loading developer profile...
              </h1>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#050816] text-white">
        <div className="relative min-h-screen overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.16),transparent_30%),linear-gradient(180deg,#050816_0%,#08111f_50%,#050816_100%)]" />

          <div className="relative mx-auto flex min-h-screen max-w-3xl items-center justify-center px-5 py-20">
            <section className="w-full rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-12">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-300/20 bg-cyan-400/10 text-4xl">
                👨‍💻
              </div>

              <p className="mt-7 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
                Creator Profile
              </p>

              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Profile Not Available
              </h1>

              <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-400">
                {error ||
                  "The developer has not published a Creator Profile yet."}
              </p>

              <Link
                href="/student/dashboard"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-100"
              >
                ← Back to Dashboard
              </Link>
            </section>
          </div>
        </div>
      </main>
    );
  }

  const skills = profile.skills || [];
  const projects =
    profile.projects && profile.projects.length > 0
      ? profile.projects
      : [];

  const featuredProjects = projects.filter(
    (project) => project.featured
  );

  const displayProjects =
    featuredProjects.length > 0 ? featuredProjects : projects;

  const visibleProjects =
    displayProjects.length > 0
      ? displayProjects
      : fallbackProjects;

  const photoUrl = normalizeUrl(profile.photoUrl);
  const companyLogoUrl = normalizeUrl(profile.companyLogoUrl);

  const githubUrl = normalizeUrl(profile.github);
  const linkedinUrl = normalizeUrl(profile.linkedin);
  const instagramUrl = normalizeUrl(profile.instagram);
  const portfolioUrl = normalizeUrl(profile.portfolio);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050816] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-[-120px] top-40 h-[32rem] w-[32rem] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute bottom-[-180px] left-1/3 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />

        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050816]/75 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link
            href="/student/dashboard"
            className="group flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-lg shadow-lg shadow-cyan-500/10">
              👨‍💻
            </div>

            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-cyan-300">
                Developer
              </div>

              <div className="text-sm font-black tracking-tight">
                Creator Profile
              </div>
            </div>
          </Link>

          <Link
            href="/student/dashboard"
            className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-white"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <section className="relative">
        <div className="mx-auto max-w-7xl px-5 pb-20 pt-14 sm:px-8 sm:pb-28 sm:pt-20 lg:pt-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                Developer • Creator • Builder
              </div>

              <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.05em] sm:text-6xl lg:text-8xl">
                Building
                <span className="block bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                  Digital Experiences
                </span>
                <span className="block">That Matter.</span>
              </h1>

              <p className="mt-7 max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">
                A glimpse into the developer behind this project — the ideas,
                technologies and products built to solve real-world problems.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <a
                  href="#about"
                  className="rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-950 transition hover:-translate-y-1 hover:bg-cyan-100"
                >
                  Explore Profile
                </a>

                {portfolioUrl && (
                  <a
                    href={portfolioUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/15 bg-white/[0.05] px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-cyan-400/10"
                  >
                    Visit Portfolio ↗
                  </a>
                )}
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                {profile.role && (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300">
                    {profile.role}
                  </span>
                )}

                {profile.company && (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300">
                    {profile.company}
                  </span>
                )}

                {profile.college && (
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300">
                    {profile.college}
                  </span>
                )}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-violet-500/20 blur-3xl" />

              <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
                <div className="absolute left-8 top-8 h-20 w-20 rounded-full border border-cyan-300/20 bg-cyan-400/10 blur-sm" />
                <div className="absolute bottom-8 right-8 h-24 w-24 rounded-full border border-violet-300/20 bg-violet-400/10 blur-sm" />

                <div className="relative aspect-[4/4.6] overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={profile.name}
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-violet-500/20">
                      <div className="flex h-36 w-36 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-5xl font-black text-white shadow-2xl">
                        {initials}
                      </div>
                    </div>
                  )}

                  <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur-xl">
                    <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-cyan-300">
                      Created & Developed By
                    </div>

                    <div className="mt-1 text-xl font-black">
                      {profile.name}
                    </div>

                    {profile.role && (
                      <div className="mt-1 text-xs text-slate-400">
                        {profile.role}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-5 -left-4 hidden rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-2xl backdrop-blur-xl sm:block">
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Projects
                </div>

                <div className="mt-1 text-lg font-black">
                  {projects.length}
                </div>
              </div>

              <div className="absolute -right-4 -top-5 hidden rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-2xl backdrop-blur-xl sm:block">
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Skills
                </div>

                <div className="mt-1 text-lg font-black">
                  {skills.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">
                01 • About
              </p>

              <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                About Me
              </h2>
            </div>

            <div>
              <p className="text-base leading-8 text-slate-300 sm:text-lg">
                {profile.about ||
                  "A developer focused on building useful, modern and reliable digital experiences."}
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {profile.education && (
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                      Education
                    </div>

                    <div className="mt-3 text-sm font-semibold leading-6 text-slate-200">
                      {profile.education}
                    </div>
                  </div>
                )}

                {profile.department && (
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                      Department
                    </div>

                    <div className="mt-3 text-sm font-semibold leading-6 text-slate-200">
                      {profile.department}
                    </div>
                  </div>
                )}

                {profile.college && (
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                      Institution
                    </div>

                    <div className="mt-3 text-sm font-semibold leading-6 text-slate-200">
                      {profile.college}
                    </div>
                  </div>
                )}

                {profile.company && (
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                      Organization
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      {companyLogoUrl ? (
                        <img
                          src={companyLogoUrl}
                          alt={profile.company}
                          className="h-10 w-10 rounded-xl border border-white/10 object-contain bg-white"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.08]">
                          🏢
                        </div>
                      )}

                      <div className="text-sm font-semibold text-slate-200">
                        {profile.company}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">
            02 • Technology
          </p>

          <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Skills & Tools
          </h2>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
            Technologies and tools used to design, build and operate modern
            applications.
          </p>
        </div>

        {skills.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {skills.map((skill, index) => (
              <div
                key={skill.id}
                className="group rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-cyan-400/[0.05]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-xl transition group-hover:scale-105">
                    {skill.icon || "⚡"}
                  </div>

                  <div>
                    <div className="text-sm font-bold text-white">
                      {skill.name}
                    </div>

                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Skill {String(index + 1).padStart(2, "0")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-center text-sm text-slate-500">
            Skills will appear here when the developer publishes them.
          </div>
        )}
      </section>

      <section className="border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">
                03 • Portfolio
              </p>

              <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                Featured Projects
              </h2>
            </div>

            <div className="text-sm text-slate-500">
              {projects.length > 0
                ? `${projects.length} published project${
                    projects.length === 1 ? "" : "s"
                  }`
                : "Selected work"}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {visibleProjects.map((project, index) => {
              const isDatabaseProject = "id" in project;

              const title = project.title;
              const description = project.description;
              const imageUrl = isDatabaseProject
                ? normalizeUrl(project.imageUrl)
                : "";

              const projectUrl = isDatabaseProject
                ? normalizeUrl(project.projectUrl)
                : "";

              const githubUrlProject = isDatabaseProject
                ? normalizeUrl(project.githubUrl)
                : "";

              const techStack = isDatabaseProject
                ? project.techStack
                : null;

              return (
                <article
                  key={
                    isDatabaseProject
                      ? project.id
                      : `${title}-${index}`
                  }
                  className="group overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/20 transition duration-300 hover:-translate-y-2 hover:border-cyan-300/25"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-violet-500/10">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <div className="text-center">
                          <div className="text-5xl">💻</div>

                          <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300">
                            Project {String(index + 1).padStart(2, "0")}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur-xl">
                      {isDatabaseProject && project.featured
                        ? "Featured"
                        : "Project"}
                    </div>
                  </div>

                  <div className="p-6">
                    <h3 className="text-xl font-black tracking-tight">
                      {title}
                    </h3>

                    <p className="mt-3 min-h-[72px] text-sm leading-7 text-slate-400">
                      {description ||
                        "A project created and developed as part of the developer's portfolio."}
                    </p>

                    {techStack && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {techStack
                          .split(",")
                          .map((technology) => technology.trim())
                          .filter(Boolean)
                          .map((technology) => (
                            <span
                              key={technology}
                              className="rounded-full border border-cyan-300/10 bg-cyan-400/[0.06] px-3 py-1.5 text-[10px] font-semibold text-cyan-200"
                            >
                              {technology}
                            </span>
                          ))}
                      </div>
                    )}

                    {isDatabaseProject &&
                      (projectUrl || githubUrlProject) && (
                        <div className="mt-6 flex flex-wrap gap-2">
                          {projectUrl && (
                            <a
                              href={projectUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-100"
                            >
                              View Project ↗
                            </a>
                          )}

                          {githubUrlProject && (
                            <a
                              href={githubUrlProject}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-white transition hover:border-white/25 hover:bg-white/10"
                            >
                              GitHub ↗
                            </a>
                          )}
                        </div>
                      )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-cyan-400/[0.08] via-white/[0.03] to-violet-400/[0.08] p-8 sm:p-12">
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-violet-400/10 blur-3xl" />

          <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">
                04 • Connect
              </p>

              <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                Let&apos;s Connect.
              </h2>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
                Explore the developer&apos;s work, professional profiles and
                portfolio.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {profile.email && (
                  <a
                    href={`mailto:${profile.email}`}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-xs font-bold text-white transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
                  >
                    Email
                  </a>
                )}

                {githubUrl && (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-xs font-bold text-white transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
                  >
                    GitHub
                  </a>
                )}

                {linkedinUrl && (
                  <a
                    href={linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-xs font-bold text-white transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
                  >
                    LinkedIn
                  </a>
                )}

                {instagramUrl && (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-xs font-bold text-white transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
                  >
                    Instagram
                  </a>
                )}

                {portfolioUrl && (
                  <a
                    href={portfolioUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-xs font-bold text-white transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
                  >
                    Portfolio
                  </a>
                )}
              </div>
            </div>

            <div className="flex justify-start lg:justify-end">
              <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 text-center backdrop-blur-xl">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={profile.company || "Organization"}
                    className="mx-auto h-20 w-20 rounded-2xl border border-white/10 bg-white object-contain p-2"
                  />
                ) : (
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-3xl">
                    ✦
                  </div>
                )}

                <div className="mt-4 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Created & Developed By
                </div>

                <div className="mt-2 text-lg font-black">
                  {profile.name}
                </div>

                {profile.company && (
                  <div className="mt-1 text-xs text-slate-500">
                    {profile.company}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-black/20">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-center sm:px-8 md:flex-row md:items-center md:justify-between md:text-left">
          <div>
            <div className="text-sm font-black">
              Created & Developed by {profile.name}
            </div>

            <div className="mt-1 text-xs text-slate-600">
              Creator Profile • Live Bus Tracking System
            </div>
          </div>

          <Link
            href="/student/dashboard"
            className="text-xs font-semibold text-slate-500 transition hover:text-cyan-300"
          >
            ← Back to Student Dashboard
          </Link>
        </div>
      </footer>
    </main>
  );
}