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

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const icon =
      typeof body.icon === "string"
        ? body.icon.trim()
        : "";

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          message: "Skill name is required.",
        },
        { status: 400 }
      );
    }

    const existingSkills = await prisma.creatorSkill.findMany({
      where: {
        profileId: result.profile.id,
      },
      orderBy: {
        sortOrder: "desc",
      },
      take: 1,
    });

    const nextSortOrder =
      existingSkills.length > 0
        ? existingSkills[0].sortOrder + 1
        : 0;

    const skill = await prisma.creatorSkill.create({
      data: {
        profileId: result.profile.id,
        name,
        icon: icon || null,
        sortOrder: nextSortOrder,
        active: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Skill added successfully.",
      skill,
    });
  } catch (error) {
    console.error("DEVELOPER_SKILL_POST_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to add skill.",
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

    const skillId =
      typeof body.id === "string"
        ? body.id.trim()
        : "";

    if (!skillId) {
      return NextResponse.json(
        {
          success: false,
          message: "Skill ID is required.",
        },
        { status: 400 }
      );
    }

    const skill = await prisma.creatorSkill.findFirst({
      where: {
        id: skillId,
        profileId: result.profile.id,
      },
    });

    if (!skill) {
      return NextResponse.json(
        {
          success: false,
          message: "Skill not found.",
        },
        { status: 404 }
      );
    }

    await prisma.creatorSkill.delete({
      where: {
        id: skill.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Skill deleted successfully.",
    });
  } catch (error) {
    console.error("DEVELOPER_SKILL_DELETE_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to delete skill.",
      },
      { status: 500 }
    );
  }
}