import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

// Faster Fixes uses a standard PostgreSQL endpoint in production.  PrismaPg
// speaks PostgreSQL over TCP, so it works both on local development databases
// and on the WireGuard-only data-01 endpoint.
const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({ adapter });

export { prisma };
