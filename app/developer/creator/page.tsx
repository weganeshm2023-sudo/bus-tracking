"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type Skill = {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  active: boolean;
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
  active: boolean;
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

const EMPTY_PROFILE: CreatorProfile = {
  id: "main",
  name: "",
  role: "",
  department: "",
  college: "",
  company: "",
  photoUrl: "",
  companyLogoUrl: "",
  about: "",
  education: "",
  email: "",
  github: "",
  linkedin: "",
  instagram: "",
  portfolio: "",
  skills: [],
  projects: [],
};

export default function DeveloperCreatorPage() {
  const [profile, setProfile] = useState<CreatorProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [skillName, setSkillName] = useState("");
  const [skillIcon, setSkillIcon] = useState("");
  const [skillSaving, setSkillSaving] = useState(false);

  const [project, setProject] = useState({
    title: "",
    description: "",
    imageUrl: "",
    projectUrl: "",
    githubUrl: "",
    techStack: "",
    featured: false,
  });
  const [projectSaving, setProjectSaving] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  async function loadProfile() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/developer/creator", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 401 || response.status === 403) {
          window.location.href = "/developer/login";
          return;
        }

        throw new Error(data.message || "Unable to load creator profile.");
      }

      setProfile({
        ...EMPTY_PROFILE,
        ...data.profile,
        skills: data.profile?.skills || [],
        projects: data.profile?.projects || [],
      });

      setPhotoPreview(data.profile?.photoUrl || "");
      setLogoPreview(data.profile?.companyLogoUrl || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  function updateField<K extends keyof CreatorProfile>(
    field: K,
    value: CreatorProfile[K],
  ) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/developer/creator", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: profile.name,
          role: profile.role,
          department: profile.department,
          college: profile.college,
          company: profile.company,
          photoUrl: profile.photoUrl,
          companyLogoUrl: profile.companyLogoUrl,
          about: profile.about,
          education: profile.education,
          email: profile.email,
          github: profile.github,
          linkedin: profile.linkedin,
          instagram: profile.instagram,
          portfolio: profile.portfolio,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save profile.");
      }

      setProfile((current) => ({
        ...current,
        ...(data.profile || {}),
      }));

      setMessage("Profile saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  function selectImage(
    event: ChangeEvent<HTMLInputElement>,
    type: "photo" | "logo",
  ) {
    const file = event.target.files?.[0] || null;

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setError("Only JPG, PNG, WEBP and GIF images are supported.");
      event.target.value = "";
      return;
    }

    setError("");

    const preview = URL.createObjectURL(file);

    if (type === "photo") {
      setPhotoFile(file);
      setPhotoPreview(preview);
    } else {
      setLogoFile(file);
      setLogoPreview(preview);
    }
  }

  async function uploadImage(type: "photo" | "logo") {
    const file = type === "photo" ? photoFile : logoFile;

    if (!file) {
      setError(type === "photo" ? "Choose a photo first." : "Choose a company logo first.");
      return;
    }

    if (type === "photo") {
      setPhotoUploading(true);
    } else {
      setLogoUploading(true);
    }

    setMessage("");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const response = await fetch("/api/developer/creator/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Upload failed.");
      }

      if (type === "photo") {
        updateField("photoUrl", data.url);
        setPhotoPreview(data.url);
        setPhotoFile(null);
      } else {
        updateField("companyLogoUrl", data.url);
        setLogoPreview(data.url);
        setLogoFile(null);
      }

      setMessage(
        type === "photo"
          ? "Photo uploaded. Click Save Profile to keep the complete profile changes."
          : "Company logo uploaded. Click Save Profile to keep the complete profile changes.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      if (type === "photo") {
        setPhotoUploading(false);
      } else {
        setLogoUploading(false);
      }
    }
  }

  async function addSkill(event: FormEvent) {
    event.preventDefault();

    if (!skillName.trim()) return;

    setSkillSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/developer/creator/skills", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: skillName.trim(),
          icon: skillIcon.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to add skill.");
      }

      setProfile((current) => ({
        ...current,
        skills: [...current.skills, data.skill],
      }));

      setSkillName("");
      setSkillIcon("");
      setMessage("Skill added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add skill.");
    } finally {
      setSkillSaving(false);
    }
  }

  async function deleteSkill(id: string) {
    if (!window.confirm("Delete this skill?")) return;

    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/developer/creator/skills?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete skill.");
      }

      setProfile((current) => ({
        ...current,
        skills: current.skills.filter((skill) => skill.id !== id),
      }));

      setMessage("Skill deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete skill.");
    }
  }

  async function addProject(event: FormEvent) {
    event.preventDefault();

    if (!project.title.trim()) return;

    setProjectSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/developer/creator/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: project.title.trim(),
          description: project.description.trim() || null,
          imageUrl: project.imageUrl.trim() || null,
          projectUrl: project.projectUrl.trim() || null,
          githubUrl: project.githubUrl.trim() || null,
          techStack: project.techStack.trim() || null,
          featured: project.featured,
          active: true,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to add project.");
      }

      setProfile((current) => ({
        ...current,
        projects: [...current.projects, data.project],
      }));

      setProject({
        title: "",
        description: "",
        imageUrl: "",
        projectUrl: "",
        githubUrl: "",
        techStack: "",
        featured: false,
      });

      setMessage("Project added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add project.");
    } finally {
      setProjectSaving(false);
    }
  }

  async function deleteProject(id: string) {
    if (!window.confirm("Delete this project?")) return;

    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/developer/creator/projects?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete project.");
      }

      setProfile((current) => ({
        ...current,
        projects: current.projects.filter((item) => item.id !== id),
      }));

      setMessage("Project deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete project.");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/developer/login";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#060912] text-white">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 text-sm text-white/70">
            Loading Developer Studio...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#060912] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-10rem] top-[-10rem] h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-[-8rem] top-40 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">
              Private Developer Area
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Developer Studio
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Manage the public creator profile, skills and projects.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/student/creator"
              target="_blank"
              className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white/80 transition hover:bg-white/10"
            >
              View Public Profile ↗
            </Link>
            <button
              onClick={logout}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-100"
            >
              Logout
            </button>
          </div>
        </header>

        {(message || error) && (
          <div
            className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
              error
                ? "border-red-400/20 bg-red-400/10 text-red-200"
                : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
            }`}
          >
            {error || message}
          </div>
        )}

        <form onSubmit={saveProfile} className="space-y-6">
          <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                  Identity
                </p>
                <h2 className="mt-2 text-xl font-black">Profile Photo</h2>
              </div>

              <div className="flex flex-col items-center">
                <div className="relative flex h-44 w-44 items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 shadow-2xl">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Creator preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-5xl">👨‍💻</span>
                  )}
                </div>

                <label className="mt-5 w-full cursor-pointer rounded-2xl border border-dashed border-cyan-300/30 bg-cyan-300/5 p-4 text-center transition hover:bg-cyan-300/10">
                  <span className="block text-sm font-bold">
                    Choose Photo
                  </span>
                  <span className="mt-1 block text-xs text-white/40">
                    JPG, PNG, WEBP or GIF · Max 5 MB
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => selectImage(event, "photo")}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => uploadImage("photo")}
                  disabled={!photoFile || photoUploading}
                  className="mt-3 w-full rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {photoUploading ? "Uploading Photo..." : "Upload Photo"}
                </button>

                <p className="mt-3 text-center text-xs leading-5 text-white/35">
                  After upload, click <b className="text-white/60">Save Profile</b>{" "}
                  below to save all profile changes.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                  Creator Information
                </p>
                <h2 className="mt-2 text-xl font-black">Public Identity</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={profile.name} onChange={(v) => updateField("name", v)} required />
                <Field label="Role" value={profile.role || ""} onChange={(v) => updateField("role", v)} placeholder="Full Stack Developer" />
                <Field label="Department" value={profile.department || ""} onChange={(v) => updateField("department", v)} />
                <Field label="College / Institution" value={profile.college || ""} onChange={(v) => updateField("college", v)} />
                <Field label="Company / Organization" value={profile.company || ""} onChange={(v) => updateField("company", v)} />
                <Field label="Education" value={profile.education || ""} onChange={(v) => updateField("education", v)} />
                <Field label="Email" value={profile.email || ""} onChange={(v) => updateField("email", v)} type="email" />
                <Field label="GitHub" value={profile.github || ""} onChange={(v) => updateField("github", v)} placeholder="https://github.com/..." />
                <Field label="LinkedIn" value={profile.linkedin || ""} onChange={(v) => updateField("linkedin", v)} placeholder="https://linkedin.com/in/..." />
                <Field label="Instagram" value={profile.instagram || ""} onChange={(v) => updateField("instagram", v)} placeholder="https://instagram.com/..." />
                <Field label="Portfolio" value={profile.portfolio || ""} onChange={(v) => updateField("portfolio", v)} placeholder="https://..." />
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/50">
                  About
                </span>
                <textarea
                  value={profile.about || ""}
                  onChange={(event) => updateField("about", event.target.value)}
                  rows={6}
                  className="w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition placeholder:text-white/20 focus:border-cyan-300/40"
                  placeholder="Write your developer story..."
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                  Organization
                </p>
                <h2 className="mt-2 text-xl font-black">Company Logo</h2>
              </div>
              <span className="text-xs text-white/35">Optional</span>
            </div>

            <div className="grid gap-6 md:grid-cols-[180px_1fr] md:items-center">
              <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/20">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Company logo preview"
                    className="max-h-full max-w-full object-contain p-4"
                  />
                ) : (
                  <span className="text-4xl">🏢</span>
                )}
              </div>

              <div>
                <label className="block cursor-pointer rounded-2xl border border-dashed border-white/15 bg-black/10 p-5 transition hover:border-cyan-300/30">
                  <span className="block text-sm font-bold">Choose Company Logo</span>
                  <span className="mt-1 block text-xs text-white/40">
                    JPG, PNG, WEBP or GIF · Max 5 MB
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => selectImage(event, "logo")}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => uploadImage("logo")}
                  disabled={!logoFile || logoUploading}
                  className="mt-3 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {logoUploading ? "Uploading Logo..." : "Upload Logo"}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                Developer Stack
              </p>
              <h2 className="mt-2 text-xl font-black">Skills & Technologies</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
              <input
                value={skillName}
                onChange={(event) => setSkillName(event.target.value)}
                placeholder="Next.js"
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-cyan-300/40"
              />
              <input
                value={skillIcon}
                onChange={(event) => setSkillIcon(event.target.value)}
                placeholder="Icon / emoji"
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-cyan-300/40"
              />
              <button
                type="button"
                onClick={addSkill}
                disabled={!skillName.trim() || skillSaving}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-40"
              >
                {skillSaving ? "Adding..." : "Add Skill"}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {profile.skills.length ? (
                profile.skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm"
                  >
                    <span>{skill.icon || "✦"}</span>
                    <span>{skill.name}</span>
                    <button
                      type="button"
                      onClick={() => deleteSkill(skill.id)}
                      className="ml-1 text-white/35 hover:text-red-300"
                      aria-label={`Delete ${skill.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/35">No skills added yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                Portfolio
              </p>
              <h2 className="mt-2 text-xl font-black">Add Project</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Project Title" value={project.title} onChange={(v) => setProject((p) => ({ ...p, title: v }))} required />
              <Field label="Image URL" value={project.imageUrl} onChange={(v) => setProject((p) => ({ ...p, imageUrl: v }))} />
              <Field label="Project URL" value={project.projectUrl} onChange={(v) => setProject((p) => ({ ...p, projectUrl: v }))} />
              <Field label="GitHub URL" value={project.githubUrl} onChange={(v) => setProject((p) => ({ ...p, githubUrl: v }))} />
              <Field label="Tech Stack" value={project.techStack} onChange={(v) => setProject((p) => ({ ...p, techStack: v }))} placeholder="Next.js, Prisma, PostgreSQL" />
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={project.featured}
                  onChange={(event) => setProject((p) => ({ ...p, featured: event.target.checked }))}
                  className="h-4 w-4 accent-cyan-300"
                />
                Featured project
              </label>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/50">
                Description
              </span>
              <textarea
                value={project.description}
                onChange={(event) => setProject((p) => ({ ...p, description: event.target.value }))}
                rows={4}
                className="w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-cyan-300/40"
              />
            </label>

            <button
              type="button"
              onClick={addProject}
              disabled={!project.title.trim() || projectSaving}
              className="mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-40"
            >
              {projectSaving ? "Adding Project..." : "Add Project"}
            </button>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {profile.projects.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-black/20"
                >
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-36 w-full object-cover"
                    />
                  )}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="font-black">{item.title}</h3>
                      <button
                        type="button"
                        onClick={() => deleteProject(item.id)}
                        className="text-xs font-bold text-red-300/70 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                    {item.description && (
                      <p className="mt-2 text-sm leading-6 text-white/50">
                        {item.description}
                      </p>
                    )}
                    {item.techStack && (
                      <p className="mt-3 text-xs font-bold text-cyan-300/80">
                        {item.techStack}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="sticky bottom-4 z-20 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-cyan-300 px-7 py-4 text-sm font-black text-slate-950 shadow-2xl shadow-cyan-500/20 transition hover:bg-cyan-200 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/50">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition placeholder:text-white/20 focus:border-cyan-300/40"
      />
    </label>
  );
}
