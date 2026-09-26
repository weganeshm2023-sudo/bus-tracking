import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getDeveloperProfile() {
  const session = await getSession();

  if (!session) {
    return {
      error: NextResponse.json(
        {
          success: false,
          message: "Not authenticated.",
        },
        { status: 401 }
      ),
    };
  }

  if (session.role !== "DEVELOPER") {
    return {
      error: NextResponse.json(
        {
          success: false,
          message: "Developer access required.",
        },
        { status: 403 }
      ),
    };
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: {
      id: "main",
    },
    include: {
      skills: {
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      },
      projects: {
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      },
    },
  });

  if (!profile) {
    return {
      error: NextResponse.json(
        {
          success: false,
          message: "Creator profile not found.",
        },
        { status: 404 }
      ),
    };
  }

  if (profile.ownerUserId !== session.sub) {
    return {
      error: NextResponse.json(
        {
          success: false,
          message: "You are not the owner of this Creator Profile.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    session,
    profile,
  };
}

export async function GET() {
  try {
    const result = await getDeveloperProfile();

    if ("error" in result) {
      return result.error;
    }

    return NextResponse.json(
      {
        success: true,
        profile: result.profile,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("DEVELOPER_CREATOR_GET_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load Creator Profile.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const result = await getDeveloperProfile();

    if ("error" in result) {
      return result.error;
    }

    const body = await request.json();

    const cleanString = (value: unknown): string | null => {
      if (typeof value !== "string") {
        return null;
      }

      const trimmed = value.trim();

      return trimmed.length > 0 ? trimmed : null;
    };

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : result.profile.name;

    const profile = await prisma.creatorProfile.update({
      where: {
        id: "main",
      },
      data: {
        name,

        role: cleanString(body.role),
        department: cleanString(body.department),
        college: cleanString(body.college),
        company: cleanString(body.company),

        photoUrl: cleanString(body.photoUrl),
        companyLogoUrl: cleanString(body.companyLogoUrl),

        about: cleanString(body.about),
        education: cleanString(body.education),

        email: cleanString(body.email),
        github: cleanString(body.github),
        linkedin: cleanString(body.linkedin),
        instagram: cleanString(body.instagram),
        portfolio: cleanString(body.portfolio),
      },
      include: {
        skills: {
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
        },
        projects: {
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Creator Profile saved successfully.",
      profile,
    });
  } catch (error) {
    console.error("DEVELOPER_CREATOR_PUT_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to save Creator Profile.",
      },
      { status: 500 }
    );
  }
}