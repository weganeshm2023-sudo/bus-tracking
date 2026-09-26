import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Not authenticated.",
        },
        { status: 401 }
      );
    }

    if (session.role !== "DEVELOPER") {
      return NextResponse.json(
        {
          success: false,
          message: "Developer access required.",
        },
        { status: 403 }
      );
    }

    const profile = await prisma.creatorProfile.findUnique({
      where: {
        id: "main",
      },
    });

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          message: "Creator profile not found.",
        },
        { status: 404 }
      );
    }

    if (profile.ownerUserId !== session.sub) {
      return NextResponse.json(
        {
          success: false,
          message: "You are not the owner of this Creator Profile.",
        },
        { status: 403 }
      );
    }

    const formData = await request.formData();

    const fileValue = formData.get("file");
    const typeValue = formData.get("type");

    if (!(fileValue instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          message: "Please select an image file.",
        },
        { status: 400 }
      );
    }

    const uploadType =
      typeof typeValue === "string" ? typeValue.trim() : "";

    if (uploadType !== "photo" && uploadType !== "logo") {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid upload type.",
        },
        { status: 400 }
      );
    }

    if (fileValue.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "The selected file is empty.",
        },
        { status: 400 }
      );
    }

    if (fileValue.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          message: "Image size must be 5 MB or less.",
        },
        { status: 400 }
      );
    }

    const extension = ALLOWED_TYPES.get(fileValue.type);

    if (!extension) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Only JPG, PNG, WEBP and GIF images are allowed.",
        },
        { status: 400 }
      );
    }

    const uploadDirectory = path.join(
      process.cwd(),
      "public",
      "uploads",
      "creator"
    );

    await mkdir(uploadDirectory, {
      recursive: true,
    });

    const fileName = `${uploadType}-${randomUUID()}.${extension}`;

    const filePath = path.join(
      uploadDirectory,
      fileName
    );

    const bytes = await fileValue.arrayBuffer();

    await writeFile(
      filePath,
      Buffer.from(bytes)
    );

    const publicUrl = `/uploads/creator/${fileName}`;

    const updatedProfile =
      uploadType === "photo"
        ? await prisma.creatorProfile.update({
            where: {
              id: "main",
            },
            data: {
              photoUrl: publicUrl,
            },
            select: {
              id: true,
              photoUrl: true,
              companyLogoUrl: true,
            },
          })
        : await prisma.creatorProfile.update({
            where: {
              id: "main",
            },
            data: {
              companyLogoUrl: publicUrl,
            },
            select: {
              id: true,
              photoUrl: true,
              companyLogoUrl: true,
            },
          });

    return NextResponse.json({
      success: true,
      message:
        uploadType === "photo"
          ? "Developer photo uploaded successfully."
          : "Company logo uploaded successfully.",
      url: publicUrl,
      profile: updatedProfile,
    });
  } catch (error) {
    console.error("DEVELOPER_CREATOR_UPLOAD_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to upload image.",
      },
      { status: 500 }
    );
  }
}