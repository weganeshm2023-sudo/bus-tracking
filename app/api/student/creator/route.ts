import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await prisma.creatorProfile.findUnique({
      where: {
        id: "main",
      },
      include: {
        skills: {
          where: {
            active: true,
          },
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
          select: {
            id: true,
            name: true,
            icon: true,
            sortOrder: true,
          },
        },
        projects: {
          where: {
            active: true,
          },
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
          select: {
            id: true,
            title: true,
            description: true,
            imageUrl: true,
            projectUrl: true,
            githubUrl: true,
            techStack: true,
            featured: true,
            sortOrder: true,
          },
        },
      },
    });

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          message: "Creator profile is not configured yet.",
          profile: null,
        },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        profile: {
          id: profile.id,
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

          skills: profile.skills,
          projects: profile.projects,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("STUDENT_CREATOR_GET_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load Creator Profile.",
        profile: null,
      },
      { status: 500 }
    );
  }
}