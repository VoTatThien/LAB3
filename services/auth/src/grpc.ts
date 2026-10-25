import * as grpc from "@grpc/grpc-js";
import { AuthInternal, bindGrpcServer, closeGrpcServer, isInternalCall, type DiscountQuote, type DiscountRequest } from "../../../shared/grpc.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { discountForScore } from "./discount.js";

const server = new grpc.Server();
server.addService(AuthInternal.service, {
  getDiscount: async (
    call: grpc.ServerUnaryCall<DiscountRequest, DiscountQuote>,
    callback: grpc.sendUnaryData<DiscountQuote>
  ) => {
    if (!isInternalCall(call, config.INTERNAL_API_KEY)) {
      callback({ code: grpc.status.UNAUTHENTICATED, message: "Internal key không hợp lệ" });
      return;
    }
    if (!Number.isInteger(call.request.userId) || call.request.userId <= 0) {
      callback({ code: grpc.status.INVALID_ARGUMENT, message: "userId không hợp lệ" });
      return;
    }
    try {
      const user = await prisma.user.findUnique({ where: { id: call.request.userId }, select: { score: true } });
      if (!user) {
        callback({ code: grpc.status.NOT_FOUND, message: "Không tìm thấy người dùng" });
        return;
      }
      callback(null, { score: user.score, ...discountForScore(user.score) });
    } catch (error) {
      console.error(error);
      callback({ code: grpc.status.INTERNAL, message: "Không thể lấy discount" });
    }
  }
});

export const startGrpc = () => bindGrpcServer(server, config.GRPC_PORT);
export const stopGrpc = () => closeGrpcServer(server);
