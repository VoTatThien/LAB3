import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

export type DiscountRequest = { userId: number };
export type DiscountQuote = { score: number; tier: string; percent: number };
export type ProductIds = { ids: number[] };
export type ProductSnapshot = { id: number; name: string; price: string };
export type ProductSnapshots = { products: ProductSnapshot[] };

const definition = protoLoader.loadSync(path.resolve(process.cwd(), "proto/ecommerce.proto"), {
  keepCase: false,
  defaults: true,
  arrays: true,
  longs: String,
  enums: String
});
const namespace = (grpc.loadPackageDefinition(definition).ecommerce as grpc.GrpcObject).v1 as grpc.GrpcObject;

export const AuthInternal = namespace.AuthInternal as grpc.ServiceClientConstructor;
export const CatalogInternal = namespace.CatalogInternal as grpc.ServiceClientConstructor;

export type AuthClient = grpc.Client & {
  getDiscount(
    request: DiscountRequest,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response: DiscountQuote) => void
  ): grpc.ClientUnaryCall;
};

export type CatalogClient = grpc.Client & {
  getProductSnapshots(
    request: ProductIds,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response: ProductSnapshots) => void
  ): grpc.ClientUnaryCall;
};

export function internalMetadata(key: string) {
  const metadata = new grpc.Metadata();
  metadata.set("x-internal-api-key", key);
  return metadata;
}

export function isInternalCall(call: grpc.ServerUnaryCall<unknown, unknown>, key: string) {
  return call.metadata.get("x-internal-api-key").some((value) => String(value) === key);
}

export async function bindGrpcServer(server: grpc.Server, port: number) {
  await new Promise<void>((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function closeGrpcServer(server: grpc.Server) {
  return new Promise<void>((resolve) => server.tryShutdown(() => resolve()));
}
