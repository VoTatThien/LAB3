import "dotenv/config";
import { z } from "zod";
export const config = z.object({ PORT: z.coerce.number().default(3003), ORDER_DATABASE_URL: z.string().min(1), JWT_SECRET: z.string().min(32), INTERNAL_API_KEY: z.string().min(16), KAFKA_BROKERS: z.string().min(1), AUTH_GRPC_TARGET: z.string().min(1).default("localhost:50051"), CATALOG_GRPC_TARGET: z.string().min(1).default("localhost:50052"), GRPC_TIMEOUT_MS: z.coerce.number().int().positive().default(3000) }).parse(process.env);
