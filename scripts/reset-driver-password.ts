import "dotenv/config";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

async function main() {
  console.log("DATABASE_URL loaded from .env");

  const userId = "cmu729axs0001rkstmhrn5yfd";
  const password = "Driver@12345";

  const passwordHash = await bcrypt.hash(password, 12);

  console.log("Creating bcrypt password hash...");
  console.log("Updating driver user...");

  const user = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      passwordHash,
      role: "DRIVER",
    },
    select: {
      id: true,
      username: true,
      role: true,
    },
  });

  console.log("");
  console.log("================================");
  console.log("DRIVER PASSWORD RESET SUCCESS");
  console.log("================================");
  console.log("Username:", user.username);
  console.log("Password:", password);
  console.log("Role:", user.role);
  console.log("User ID:", user.id);
  console.log("================================");
}

main()
  .catch((error) => {
    console.error("");
    console.error("RESET_DRIVER_PASSWORD_ERROR");
    console.error("Name:", error?.name);
    console.error("Code:", error?.code);
    console.error("Message:", error?.message);
    console.error("Meta:", error?.meta);
    console.error("");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });