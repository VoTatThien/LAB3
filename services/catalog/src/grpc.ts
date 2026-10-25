import * as grpc from "@grpc/grpc-js";
import { CatalogInternal, bindGrpcServer, closeGrpcServer, isInternalCall, type ProductIds, type ProductSnapshots } from "../../../shared/grpc.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

const server = new grpc.Server();
server.addService(CatalogInternal.service, {
  getProductSnapshots: async (
    call: grpc.ServerUnaryCall<ProductIds, ProductSnapshots>,
    callback: grpc.sendUnaryData<ProductSnapshots>
  ) => {
    if (!isInternalCall(call, config.INTERNAL_API_KEY)) {
      callback({ code: grpc.status.UNAUTHENTICATED, message: "Internal key không hợp lệ" });
      return;
    }
    const ids = call.request.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
      callback({ code: grpc.status.INVALID_ARGUMENT, message: "Danh sách sản phẩm không hợp lệ" });
      return;
    }
    try {
      const products = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, price: true } });
      if (products.length !== ids.length) {
        callback({ code: grpc.status.NOT_FOUND, message: "Có sản phẩm không tồn tại" });
        return;
      }
      callback(null, { products: products.map((product) => ({ id: product.id, name: product.name, price: product.price.toString() })) });
    } catch (error) {
      console.error(error);
      callback({ code: grpc.status.INTERNAL, message: "Không thể lấy snapshot sản phẩm" });
    }
  }
});

export const startGrpc = () => bindGrpcServer(server, config.GRPC_PORT);
export const stopGrpc = () => closeGrpcServer(server);
