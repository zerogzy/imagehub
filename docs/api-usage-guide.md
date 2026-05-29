# ImageHub API 使用教程
本文档面向前端、脚本和第三方系统接入 ImageHub API。后端为 NestJS + Fastify，API 全局前缀为 `/api/v1`。

## 1. 基础信息
- 生产 API Base URL: `https://img.zerogzy.net/api/v1`
- 服务器内调试: `http://localhost:3001/api/v1`
- Swagger 文档: `/api/docs`
- 默认端口: `3001`
- 单文件上传限制: `200MB`

## 2. 认证方式
推荐使用 Bearer Token:

```http
Authorization: Bearer <token>
```
也支持备用 Header:

```http
X-ImageHub-Token: <token>
```
不要把 token 放在 URL 查询参数中，`?token=` 会被拒绝。

| 角色 | 权限 |
| --- | --- |
| `visitor` | 浏览、详情、搜索、下载 |
| `admin` | visitor 权限 + 上传、删除、分组、标签、分享、备份、统计等管理能力 |
## 3. 通用响应
成功响应通常为:

```json
{ "success": true, "data": {} }
```
失败响应通常为:

```json
{ "success": false, "message": "错误信息" }
```
## 4. JavaScript 请求封装
```ts
export async function imagehub<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://img.zerogzy.net/api/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || json?.error?.message || `请求失败: ${res.status}`);
  }
  return json?.data ?? json;
}
```
上传 multipart 时不要手动设置 `Content-Type`，浏览器会自动生成 boundary。

## 5. 快速开始
```bash
BASE="https://img.zerogzy.net/api/v1"
TOKEN="你的访问令牌"
ADMIN_TOKEN="你的管理员令牌"

curl -H "Authorization: Bearer $TOKEN" "$BASE/me"
```
## 6. 公开接口
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/settings/public` | 获取公开设置 |
| GET | `/storage/derivatives/:year/:month/:day/:filename` | 访问缩略图、预览图等派生文件 |
| GET | `/storage/originals/:year/:month/:day/:filename` | 访问原始文件；图片会返回 403，GIF/视频/音频可放行 |
| GET | `/download/temp/:token` | 临时下载链接 |
| GET | `/share/download/:shareId` | 永久分享下载 |
图片原图不要直接使用 `/storage/originals/...`，应使用 `/assets/:id/original` 鉴权获取，或通过 `/download/token` 下载。

## 7. 当前用户
```http
GET /me
```
```bash
curl -H "Authorization: Bearer $TOKEN" "$BASE/me"
```
用于登录校验和判断当前 token 角色。

## 8. 图库浏览
### 获取图库列表
```http
GET /gallery
```
| 参数 | 说明 |
| --- | --- |
| `page` / `pageSize` | 分页 |
| `groupId` | 一级分组过滤 |
| `subgroupId` | 二级分组过滤 |
| `mediaType` | `image`、`gif`、`video`、`audio` |
| `tag` | 标签过滤 |
| `sortMode` | `newest`、`oldest`、`random` |
| `seed` | 随机排序种子 |
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/gallery?page=1&pageSize=40&mediaType=image&sortMode=newest"
```
典型返回:

```json
{ "assets": [], "page": 1, "pageSize": 40, "total": 0, "totalPages": 0 }
```
### 获取资产详情
```http
GET /assets/:id
```
```bash
curl -H "Authorization: Bearer $TOKEN" "$BASE/assets/<assetId>"
```
### 鉴权获取图片原图
```http
GET /assets/:id/original
```
```ts
const res = await fetch(`/api/v1/assets/${assetId}/original`, {
  headers: { Authorization: `Bearer ${token}` },
});
const objectUrl = URL.createObjectURL(await res.blob());
URL.revokeObjectURL(objectUrl);
```
## 9. 派生图 URL
接口返回的 `storageKey` 可能类似 `thumb/2026/05/29/xxx.webp`。访问时通常去掉前缀类型目录后拼接:

```ts
function derivativeUrl(storageKey: string) {
  const key = storageKey.replace(/^(thumb|preview|large)\//, "");
  return `/api/v1/storage/derivatives/${key}`;
}
```
推荐顺序: 列表用 `thumb`，详情占位用 `large`，fallback 到 `preview`，最后 fallback 到 `thumb`。

## 10. 分组与标签
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/groups` | 分组列表 |
| GET | `/groups/:id` | 分组详情 |
| GET | `/groups/:id/subgroups` | 二级分组列表 |
| GET | `/tags` | 标签列表 |
```bash
curl -H "Authorization: Bearer $TOKEN" "$BASE/groups"
curl -H "Authorization: Bearer $TOKEN" "$BASE/tags"
```
## 11. 搜索
### 全局搜索
```http
GET /search/global?q=<关键词>&page=1&pageSize=40&mediaType=image
```
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/search/global?q=猫&page=1&pageSize=40"
```
### 分组搜索
```http
GET /search/group?groupId=<groupId>&q=<关键词>&subgroupId=<subgroupId>&tag=<tag>&mediaType=image
```
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/search/group?groupId=<groupId>&q=风景&page=1&pageSize=40"
```
## 12. 下载
### 创建临时下载 token
```http
POST /download/token
```
```bash
curl -X POST "$BASE/download/token" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"assetId\":\"<assetId>\"}"
```
返回中包含 `downloadUrl` 和 `expiresAt`。随后访问 `/download/temp/:token` 下载文件。

### 批量下载
```http
POST /download/batch
```
```json
{ "assetIds": ["assetId1", "assetId2"] }
```
返回 `jobId`，可通过 `/admin/jobs/:id` 查询任务状态。

## 13. 管理员上传
### 单文件上传
```http
POST /admin/upload
```
```bash
curl -X POST "$BASE/admin/upload" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@/path/to/image.jpg" \
  -F "groupId=<groupId>" \
  -F "subgroupId=<subgroupId>"
```
### 批量上传
```http
POST /admin/upload/batch
```
```bash
curl -X POST "$BASE/admin/upload/batch" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "files=@/path/a.jpg" \
  -F "files=@/path/b.jpg"
```
不传 `groupId` 时会自动进入默认分组和默认二级分组；传 `groupId` 但不传 `subgroupId` 时，会进入该分组的默认二级分组。上传后资产通常先为 `processing`，派生图生成成功后变为 `ready`，失败则为 `failed`。

## 14. 管理员资产接口
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/assets` | 后台资产列表，支持分页、媒体类型、状态、搜索、分组过滤 |
| PATCH | `/admin/assets/:id` | 更新显示文件名 |
| DELETE | `/admin/assets/:id` | 软删除资产 |
| POST | `/admin/assets/batch/delete` | 批量软删除 |
| POST | `/admin/assets/batch/tag` | 批量打标签 |
| POST | `/admin/assets/batch/untag` | 批量去标签 |
| POST | `/admin/assets/move-to-group` | 批量移动到分组 |
更新显示名:

```bash
curl -X PATCH "$BASE/admin/assets/<assetId>" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"displayFilename\":\"新的显示名.jpg\"}"
```
批量打标签:

```bash
curl -X POST "$BASE/admin/assets/batch/tag" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"assetIds\":[\"<assetId>\"],\"names\":[\"猫\",\"风景\"],\"source\":\"admin\"}"
```
## 15. 管理员分组接口
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/admin/groups` | 创建一级分组 |
| PATCH | `/admin/groups/:id` | 更新一级分组 |
| DELETE | `/admin/groups/:id` | 删除一级分组；默认分组不可删，资产会迁移到默认分组 |
| POST | `/admin/groups/reorder` | 一级分组排序 |
| POST | `/admin/subgroups` | 创建二级分组 |
| PATCH | `/admin/subgroups/:id` | 更新二级分组 |
| DELETE | `/admin/subgroups/:id` | 删除二级分组 |
| POST | `/admin/subgroups/reorder` | 二级分组排序 |
| POST | `/admin/groups/:id/assets/reorder` | 分组内资产排序 |
```bash
curl -X POST "$BASE/admin/groups" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"风景\",\"slug\":\"landscape\",\"description\":\"风景图片\"}"
```
## 16. 管理员 token 接口
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/tokens` | Token 列表 |
| POST | `/admin/tokens` | 创建 Token |
| GET | `/admin/tokens/:id` | Token 详情 |
| PATCH | `/admin/tokens/:id` | 更新 Token |
| DELETE | `/admin/tokens/:id` | 删除 Token；不能删除最后一个启用的 admin token |
| POST | `/admin/tokens/:id/rotate` | 旋转 Token |
```bash
curl -X POST "$BASE/admin/tokens" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"visitor\",\"role\":\"visitor\"}"
```
创建 admin token 时不能自定义原始 token，系统会生成随机值。创建或旋转后请立即保存返回的原始 token。

## 17. 分享接口
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/admin/shares/permanent` | 创建永久分享 |
| GET | `/admin/shares/permanent` | 分享列表 |
| DELETE | `/admin/shares/permanent/:shareId` | 撤销分享 |
| GET | `/share/download/:shareId` | 公开下载分享文件 |
```bash
curl -X POST "$BASE/admin/shares/permanent" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"assetId\":\"<assetId>\"}"
```
分享下载地址格式: `https://img.zerogzy.net/api/v1/share/download/<shareId>`。

## 18. 回收站
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/trash` | 回收站列表 |
| POST | `/admin/trash/restore` | 恢复单个或多个资产 |
| POST | `/admin/trash/purge` | 永久删除单个或多个资产 |
恢复请求体可传 `{ "assetId": "..." }` 或 `{ "assetIds": ["..."] }`。永久删除会删除数据库记录和存储文件，不可恢复。

## 19. 统计、备份与任务
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/stats/overview` | 统计概览 |
| GET | `/admin/stats/asset?assetId=<assetId>` | 单资产统计 |
| GET | `/admin/stats/assets?type=views&limit=10` | 热门资产 |
| POST | `/admin/stats/clear` | 清除统计 |
| POST | `/admin/backup/export` | 创建备份任务 |
| GET | `/admin/backup/:jobId` | 备份任务状态 |
| GET | `/admin/jobs` | 任务列表 |
| GET | `/admin/jobs/:id` | 任务详情 |
| POST | `/admin/jobs/:id/retry` | 重试任务 |
`/admin/stats/tokens` 和 `/admin/stats/shares` 当前为占位接口。

## 20. 相似度检测
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/similarity/candidates` | 候选列表，支持 `status`、`page`、`pageSize` |
| POST | `/admin/similarity/scan` | 触发扫描 |
| POST | `/admin/similarity/resolve` | 解决候选 |
候选分类包括 `exact_duplicate`、`highly_similar`、`possible_variant`、`same_topic`。

## 21. Worker 内部接口
这些接口供 Python Worker 使用，不建议普通客户端直接调用。认证 Header:

```http
X-ImageHub-Token: <WORKER_TOKEN 或 INTERNAL_API_TOKEN>
```
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/worker/similarity/assets` | 获取待处理资产 |
| POST | `/worker/similarity/fingerprints/bulk` | 批量写入指纹 |
| POST | `/worker/similarity/candidates/bulk` | 批量写入候选 |
## 22. 常见错误
| 状态码 | 说明 |
| --- | --- |
| `400` | 请求参数错误 |
| `401` | 未认证或 token 无效 |
| `403` | 权限不足、visitor 调 admin 接口、或直接访问图片原图 |
| `404` | 资源不存在 |
| `409` | 名称或资源冲突 |
| `413` | 上传文件超过限制 |
| `429` | 触发限流 |
| `500` | 服务端错误 |
## 23. 常见排查
- 401: 检查 `Authorization: Bearer <token>` 是否正确。
- 403: 检查是否使用 visitor token 调用了 `/admin/*`，或是否直接访问图片原图。
- 上传后不显示: 查看资产状态是否为 `ready`，并确认 derivatives 是否生成。
- 搜索不到: 确认资产为 `ready`，必要时调用 `/admin/search/reindex-all`。
- 下载链接失效: 重新调用 `/download/token`，临时下载 token 默认约 5 分钟有效。

## 24. 推荐接入流程
1. 调 `/me` 校验 token。
2. 调 `/groups` 获取分组树。
3. 调 `/gallery` 展示图库。
4. 调 `/assets/:id` 查看详情。
5. 缩略图走 `/storage/derivatives/...`。
6. 图片原图展示走 `/assets/:id/original`。
7. 下载走 `/download/token` + `/download/temp/:token`。
8. 管理端上传走 `/admin/upload`。
9. 标签管理走 `/admin/tags` 和 `/admin/assets/batch/tag`。
10. 分享走 `/admin/shares/permanent`。
