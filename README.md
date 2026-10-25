# Lab 3 — E-commerce Microservices, gRPC, Kafka và Saga

Tài liệu ngắn theo **8 câu hỏi của bài lab**. Hệ thống dùng Node.js, Express, Prisma, PostgreSQL, gRPC, Kafka và Docker Compose. Các ví dụ Postman dùng URL trực tiếp, không cần Postman Environment.

## Chạy dự án và chuẩn bị token

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm run proto:check
npm run typecheck
npm run test:grpc
docker compose up --build -d
docker compose ps -a
```

Đổi mật khẩu, `JWT_SECRET` và `INTERNAL_API_KEY` mẫu trong `.env`. Gateway dùng `http://localhost:3000`; nếu cổng đó bận, đặt `GATEWAY_PORT=3100` trong `.env` rồi dùng `http://localhost:3100` cho mọi request bên dưới. Không commit `.env`.

Để lấy token khách hàng, gửi trong Postman:

```http
POST http://localhost:3000/api/v1/auth/register
Content-Type: application/json
```

```json
{"username":"customer01","fullName":"Nguyen Van A","password":"Customer@123"}
```

Nếu tên đã tồn tại, đổi username hoặc gọi `POST /api/v1/auth/login` với `username` và `password`. Sao chép `data.accessToken`; ở các request cần đăng nhập, chọn **Authorization → Bearer Token** và dán token vào ô Token.

## Câu 1. Các protocol và cấu trúc dự án là gì?

| Thành phần | Vai trò |
|---|---|
| `services/api-gateway` | Cổng REST/HTTP công khai; chuyển request tới service tương ứng |
| `services/auth` | Đăng ký, đăng nhập, JWT, score và membership; sở hữu `auth_db` |
| `services/catalog` | Sản phẩm và tồn kho; sở hữu `catalog_db` |
| `services/order` | Đơn hàng và discount; sở hữu `order_db` |
| `services/shipping` | Giao hàng; sở hữu `shipping_db` |
| `shared/kafka.ts` | Phát/nhận sự kiện JSON qua Kafka |
| `proto/ecommerce.proto` | Định nghĩa RPC và message Protobuf cho gRPC nội bộ; đồng thời mô tả dạng dữ liệu event Kafka |

Client gọi Gateway bằng REST/JSON. Khi tạo đơn, Order gọi Auth và Catalog bằng gRPC/Protobuf. Sau đó các service phối hợp Saga qua Kafka/JSON. Mỗi service có Prisma schema riêng; không có foreign key giữa các database.

### Đọc file `.proto` từ đầu

File [ecommerce.proto](proto/ecommerce.proto) là **bản hợp đồng giao tiếp**: nó khai báo tên hàm có thể gọi từ xa và hình dạng dữ liệu gửi/nhận. Nó không chứa câu lệnh SQL hay logic tính giảm giá. Đọc lần lượt như sau:

1. `syntax = "proto3";` chọn phiên bản cú pháp Protobuf. `package ecommerce.v1;` đặt tên nhóm và phiên bản cho hợp đồng, giúp phân biệt khi sau này có `v2`.
2. `message` giống một kiểu dữ liệu gồm nhiều thuộc tính. Ví dụ `DiscountRequest` có `int32 user_id = 1;`: `int32` là số nguyên, `user_id` là tên trường, còn `1` là **mã số trường khi mã hóa**, không phải giá trị mặc định và cũng không phải ID người dùng. Khi sửa hợp đồng về sau, đừng tùy tiện đổi hoặc tái sử dụng mã số trường đã phát hành.
3. `repeated` nghĩa là danh sách. `repeated int32 ids = 1;` nhận nhiều ID sản phẩm; `repeated ProductSnapshot products = 1;` trả về nhiều sản phẩm. Một `ProductSnapshot` chứa `id`, `name`, `price`. Giá dùng `string`, ví dụ `"1599.00"`, để không phải biểu diễn tiền bằng số thực `float`.
4. `service` nhóm các hàm gRPC; `rpc` là một hàm gọi từ xa. Dòng `rpc GetDiscount(DiscountRequest) returns (DiscountQuote);` nghĩa là Order gửi `DiscountRequest` tới Auth và nhận `DiscountQuote` gồm `score`, `tier`, `percent`. Tương tự, `GetProductSnapshots(ProductIds)` gọi Catalog và nhận `ProductSnapshots`.
5. Các `message` có tên `OrderCreatedEvent`, `InventoryReservedEvent`... ở nửa sau file chỉ **mô tả** event Saga để người đọc hiểu cấu trúc. Kafka trong repo hiện vẫn gửi JSON; khai báo trong `.proto` **không tự làm Kafka dùng Protobuf**.

Ví dụ luồng tạo đơn: client gửi `POST /api/v1/orders` bằng JSON → Gateway chuyển tới Order → Order gọi `AuthInternal.GetDiscount` để lấy mức giảm theo score và `CatalogInternal.GetProductSnapshots` để lấy tên/giá sản phẩm → Order lưu đơn rồi phát `order.created` qua Kafka. Đây là hai kiểu giao tiếp khác nhau: **gRPC để hỏi và nhận kết quả ngay**, **Kafka để phát sự kiện cho các service xử lý tiếp**.

Trong code, [shared/grpc.ts](shared/grpc.ts) nạp file `.proto` lúc chạy (không tạo sẵn file mã nguồn từ proto). [Order](services/order/src/grpc-clients.ts) là phía gọi; [Auth](services/auth/src/grpc.ts) và [Catalog](services/catalog/src/grpc.ts) là phía xử lý RPC. `user_id` trong proto được thư viện ánh xạ thành `userId` trong JavaScript. Auth nghe cổng `50051`, Catalog nghe cổng `50052` trong mạng Docker, không mở hai cổng này ra máy host. Order gửi `x-internal-api-key` trong gRPC metadata; đây là kiểm tra quyền gọi nội bộ, **không phải mã hóa đường truyền**. Gateway vẫn cung cấp REST công khai cho Postman.

Tự kiểm tra:

```powershell
npm run proto:check
npm run test:grpc
```

**Đánh giá:** Lệnh đầu phải báo `proto/ecommerce.proto: valid`. Lệnh sau phải báo `1` test `pass`, `0` test `fail`: hai RPC trao đổi được dữ liệu Protobuf, và server thử nghiệm từ chối lời gọi thiếu metadata. Các lệnh này chưa thay thế kiểm thử end-to-end với Docker và database.

## Câu 2. Docker Compose chạy những container nào?

```powershell
docker compose config --quiet
docker compose ps -a
Invoke-RestMethod http://localhost:3000/health/ready
```

**Đánh giá:** Compose có **10 service**. Bảy container `postgres`, `kafka`, `auth`, `catalog`, `order`, `shipping`, `gateway` phải `Up (healthy)`. Ba job `database-init`, `kafka-init`, `migrate` kết thúc `Exited (0)`. `/health/ready` trả `status: "ready"` và `auth`, `catalog`, `order`, `shipping` đều `true`.

Nếu chưa đạt, xem `docker compose logs --tail=100 <service>`.

## Câu 3. Kafka và Saga Choreography hoạt động thế nào?

Kafka chạy KRaft một node: container dùng `kafka:19092`, máy host dùng `localhost:9092`. Có **7 topic**: `order.created`, `inventory.reserved`, `inventory.rejected`, `order.confirmed`, `order.cancelled`, `shipment.created`, `shipment.cancelled`. Mỗi topic có 3 partition, replication factor 1. Bốn consumer group: `catalog-inventory`, `order-saga`, `shipping-saga`, `auth-loyalty`.

```text
order.created → Catalog giữ kho
  ├─ inventory.reserved → Order CONFIRMED → order.confirmed
  │                                       ├─ Auth cộng score
  │                                       └─ Shipping tạo shipment
  └─ inventory.rejected → Order CANCELLED → order.cancelled → hoàn kho nếu cần
```

Các service tự phản ứng với event; không có service điều phối Saga. `ProcessedEvent` giúp tránh xử lý lại cùng event.

```powershell
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:19092 --list
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:19092 --list
```

**Đánh giá:** Thấy đủ 7 topic nghiệp vụ và 4 consumer group. Topic nội bộ `__consumer_offsets` có thể xuất hiện thêm.

## Câu 4. TC-PRO-01 — Lấy danh sách Product?

```http
GET http://localhost:3100/api/v1/products?page=1&limit=20
```

Không cần token. Có thể thêm `&search=Laptop`.

**Đánh giá:** HTTP `200`, `success: true`, `data` là mảng sản phẩm có `id`, `name`, `price`, `quantity`; `meta` chứa thông tin phân trang. Sản phẩm seed gồm `Laptop MVP` và `Wireless Mouse`.

## Câu 5. TC-CUS-04 — Xem Membership của khách hàng?

```http
GET http://localhost:3100/api/v1/auth/me
Authorization: Bearer <CUSTOMER_TOKEN>
```

**Đánh giá:** HTTP `200`; `data` có `username`, `role: "CUSTOMER"`, `score` và `membership` gồm `tier`, `percent`. Membership được tính từ `User.score` trong Auth service, không lưu ở bảng riêng.

## Câu 6. TC-CUS-05 — Thiếu token thì sao?

Gọi lại `GET /api/v1/auth/me`, nhưng trong Postman chọn **Authorization → No Auth** và bỏ header `Authorization`.

**Đánh giá:** HTTP `401`, response có `success: false` và `error: "Thiếu access token"`.

## Câu 7. TC-ORD-04 — Discount được tính theo score thế nào?

| Score trước khi đặt | Hạng | Giảm giá |
|---:|---|---:|
| 0–99 | BASIC | 0% |
| 100–499 | SILVER | 5% |
| 500–999 | GOLD | 10% |
| Từ 1000 | DIAMOND | 15% |

Để kiểm tra nhánh SILVER trên **dữ liệu local**, đặt score của `customer01` thành 100:

```powershell
docker compose exec postgres psql -U ecommerce -d auth_db -c 'UPDATE "User" SET score = 100 WHERE username = ''customer01'';'
```

Gọi lại câu 5 để xác nhận `tier: "SILVER"`, `percent: 5`. Lấy ID thật của `Laptop MVP` từ câu 4, rồi tạo đơn:

```http
POST http://localhost:3100/api/v1/orders
Authorization: Bearer <CUSTOMER_TOKEN>
Content-Type: application/json
```

```json
{"items":[{"productId":1,"quantity":1}]}
```

**Đánh giá:** Nếu laptop có giá `1599.00`, response HTTP `202` chứa `data.subtotal: "1599.00"`, `discountPercent: 5`, `discountAmount: "79.95"`, `total: "1519.05"`, `scoreSnapshot: 100`. Thay `productId: 1` nếu ID thực tế khác. Snapshot giữ nguyên khi score thay đổi sau đó. Đây cũng là phép thử luồng Order → Auth/Catalog bằng gRPC.

## Câu 8. TC-ORD-05 — Tạo Order và kiểm tra event?

Gửi `POST /api/v1/orders` như câu 7. Response ban đầu HTTP `202`, đơn `PENDING`; ghi lại `data.id`. Để quan sát event, mở terminal trước khi gửi request:

```powershell
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:19092 --topic order.created
```

Sau vài giây, kiểm tra đơn bằng `GET /api/v1/orders/<ORDER_ID>` với CUSTOMER_TOKEN.

**Đánh giá:** Terminal thấy `order.created`; đơn chuyển `CONFIRMED`, tồn kho giảm đúng số lượng, Auth cộng `max(1, floor(total / 10))` điểm và Shipping tạo shipment. Nếu tồn kho không đủ, đơn chuyển `CANCELLED` và không trừ kho một phần.

Để xem shipment qua API, đăng nhập admin bằng `POST /api/v1/auth/login` với `admin` / `Admin@123`, sau đó gọi `GET /api/v1/shipments` bằng token admin. Tài khoản này chỉ dùng cho lab local.

## Dừng hệ thống

`docker compose down` dừng container và giữ dữ liệu. Lệnh `docker compose down --volumes` xóa cả dữ liệu PostgreSQL và Kafka; chỉ dùng khi thật sự muốn làm lại từ đầu.
