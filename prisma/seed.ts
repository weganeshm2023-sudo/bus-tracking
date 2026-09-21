import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPassword = await bcrypt.hash("Admin@12345", 12);
  const driverPassword = await bcrypt.hash("Driver@12345", 12);
  const studentPassword = await bcrypt.hash("Student@12345", 12);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      passwordHash: adminPassword,
      role: "ADMIN",
    },
    create: {
      username: "admin",
      passwordHash: adminPassword,
      role: "ADMIN",
    },
  });

  const driverUser = await prisma.user.upsert({
    where: { username: "driver01" },
    update: {
      passwordHash: driverPassword,
      role: "DRIVER",
    },
    create: {
      username: "driver01",
      passwordHash: driverPassword,
      role: "DRIVER",
    },
  });

  await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: {
      driverId: "DRV-001",
      name: "Ravi Kumar",
    },
    create: {
      driverId: "DRV-001",
      name: "Ravi Kumar",
      userId: driverUser.id,
    },
  });

  const studentUser = await prisma.user.upsert({
    where: { username: "student01" },
    update: {
      passwordHash: studentPassword,
      role: "STUDENT",
    },
    create: {
      username: "student01",
      passwordHash: studentPassword,
      role: "STUDENT",
    },
  });

  await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {
      studentId: "STU-0001",
      name: "Arun Kumar",
    },
    create: {
      studentId: "STU-0001",
      name: "Arun Kumar",
      userId: studentUser.id,
    },
  });

  console.log("Seed completed successfully.");
  console.log("Admin:   admin / Admin@12345");
  console.log("Driver:  driver01 / Driver@12345");
  console.log("Student: student01 / Student@12345");
}

main()
  .catch((error) => {
    console.error("SEED_ERROR:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });