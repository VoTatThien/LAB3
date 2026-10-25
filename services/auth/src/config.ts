import "dotenv/config";
import { z } from "zod";
export const config = z.object({
  PORT: z.coerce.number().default(3001),
  GRPC_PORT: z.coerce.number().int().min(1).max(65535).default(50051),
  AUTH_DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("1d"),
  INTERNAL_API_KEY: z.string().min(16),
  KAFKA_BROKERS: z.string().min(1)
}).parse(process.env);
