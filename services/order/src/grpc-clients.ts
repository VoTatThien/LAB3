import * as grpc from "@grpc/grpc-js";
import { AppError } from "../../../shared/app-error.js";
import { AuthInternal, CatalogInternal, internalMetadata, type AuthClient, type CatalogClient, type DiscountQuote, type ProductSnapshot } from "../../../shared/grpc.js";
import { config } from "./config.js";

// proto-loader adds RPC methods at runtime; its constructor type is only ServiceClient.
const auth = new AuthInternal(config.AUTH_GRPC_TARGET, grpc.credentials.createInsecure()) as unknown as AuthClient;
const catalog = new CatalogInternal(config.CATALOG_GRPC_TARGET, grpc.credentials.createInsecure()) as unknown as CatalogClient;

function rpcError(error: grpc.ServiceError) {
  const badRequest = error.code === grpc.status.INVALID_ARGUMENT || error.code === grpc.status.NOT_FOUND;
  return new AppError(badRequest ? 400 : 503, badRequest ? error.details : "Service gRPC nội bộ không sẵn sàng");
}

export function getDiscount(userId: number) {
  return new Promise<DiscountQuote>((resolve, reject) => {
    auth.getDiscount(
      { userId },
      internalMetadata(config.INTERNAL_API_KEY),
      { deadline: Date.now() + config.GRPC_TIMEOUT_MS },
      (error, response) => error ? reject(rpcError(error)) : resolve(response)
    );
  });
}

export function getProductSnapshots(ids: number[]) {
  return new Promise<ProductSnapshot[]>((resolve, reject) => {
    catalog.getProductSnapshots(
      { ids },
      internalMetadata(config.INTERNAL_API_KEY),
      { deadline: Date.now() + config.GRPC_TIMEOUT_MS },
      (error, response) => error ? reject(rpcError(error)) : resolve(response.products)
    );
  });
}

export async function checkGrpcReady() {
  await Promise.all([auth, catalog].map((client) => new Promise<void>((resolve, reject) => {
    client.waitForReady(Date.now() + config.GRPC_TIMEOUT_MS, (error) => error ? reject(error) : resolve());
  })));
}

export function closeGrpcClients() {
  auth.close();
  catalog.close();
}
