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

export async function POST(request: Request) {
  try {
    const result = await getDeveloperProfile();

    if ("error" in result) {
      return result.error;
    }

    const body = await request.json();

    const title =
      typeof body.title === "string"
        ? body.title.trim()
        : "";

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";

    const imageUrl =
      typeof body.imageUrl === "string"
        ? body.imageUrl.trim()
        : "";

    const projectUrl =
      typeof body.projectUrl === "string"
        ? body.projectUrl.trim()
        : "";

    const githubUrl =
      typeof body.githubUrl === "string"
        ? body.githubUrl.trim()
        : "";

    const techStack =
      typeof body.techStack === "string"
        ? body.techStack.trim()
        : "";

    const featured = body.featured === true;

    if (!title) {
      return NextResponse.json(
        {
          success: false,
          message: "Project title is required.",
        },
        { status: 400 }
      );
    }

    const existingProjects = await prisma.creatorProject.findMany({
      where: {
        profileId: result.profile.id,
      },
      orderBy: {
        sortOrder: "desc",
      },
      take: 1,
    });

    const nextSortOrder =
      existingProjects.length > 0
        ? existingProjects[0].sortOrder + 1
        : 0;

    const project = await prisma.creatorProject.create({
      data: {
        profileId: result.profile.id,

        title,
        description: description || null,
        imageUrl: imageUrl || null,
        projectUrl: projectUrl || null,
        githubUrl: githubUrl || null,
        techStack: techStack || null,

        featured,
        active: true,
        sortOrder: nextSortOrder,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Project added successfully.",
      project,
    });
  } catch (error) {
    console.error("DEVELOPER_PROJECT_POST_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to add project.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const result = await getDeveloperProfile();

    if ("error" in result) {
      return result.error;
    }

    const body = await request.json();

    const projectId =
      typeof body.id === "string"
        ? body.id.trim()
        : "";

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          message: "Project ID is required.",
        },
        { status: 400 }
      );
    }

    const project = await prisma.creatorProject.findFirst({
      where: {
        id: projectId,
        profileId: result.profile.id,
      },
    });

    if (!project) {
      return NextResponse.json(
        {
          success: false,
          message: "Project not found.",
        },
        { status: 404 }
      );
    }

    await prisma.creatorProject.delete({
      where: {
        id: project.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Project deleted successfully.",
    });
  } catch (error) {
    console.error("DEVELOPER_PROJECT_DELETE_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to delete project.",
      },
      { status: 500 }
    );
  }
}