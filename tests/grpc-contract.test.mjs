import assert from "node:assert/strict";
import test from "node:test";
import * as grpc from "@grpc/grpc-js";
import { AuthInternal, CatalogInternal, internalMetadata } from "../dist/shared/grpc.js";

test("Order có thể gọi hai RPC Protobuf với metadata nội bộ", async () => {
  const server = new grpc.Server();
  server.addService(AuthInternal.service, {
    getDiscount(call, callback) {
      if (call.metadata.get("x-internal-api-key")[0] !== "test-internal-key") {
        callback({ code: grpc.status.UNAUTHENTICATED, message: "Missing key" });
        return;
      }
      callback(null, { score: call.request.userId * 100, tier: "SILVER", percent: 5 });
    }
  });
  server.addService(CatalogInternal.service, {
    getProductSnapshots(call, callback) {
      callback(null, { products: call.request.ids.map((id) => ({ id, name: "Laptop", price: "1599.00" })) });
    }
  });

  const port = await new Promise((resolve, reject) => {
    server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) reject(error);
      else resolve(boundPort);
    });
  });
  const auth = new AuthInternal(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  const catalog = new CatalogInternal(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  const unary = (client, method, request, metadata) => new Promise((resolve, reject) => {
    client[method](request, metadata, (error, response) => error ? reject(error) : resolve(response));
  });

  try {
    const discount = await unary(auth, "getDiscount", { userId: 1 }, internalMetadata("test-internal-key"));
    assert.deepEqual(discount, { score: 100, tier: "SILVER", percent: 5 });
    const snapshots = await unary(catalog, "getProductSnapshots", { ids: [3] }, internalMetadata("test-internal-key"));
    assert.deepEqual(snapshots, { products: [{ id: 3, name: "Laptop", price: "1599.00" }] });
    await assert.rejects(
      unary(auth, "getDiscount", { userId: 1 }, new grpc.Metadata()),
      { code: grpc.status.UNAUTHENTICATED }
    );
  } finally {
    auth.close();
    catalog.close();
    await new Promise((resolve) => server.tryShutdown(resolve));
  }
});
