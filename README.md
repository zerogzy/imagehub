# ImageHub

ImageHub 是一个私有媒体管理与图片广场系统，适合个人或小团队集中管理图片、GIF、视频和音频素材。项目采用 monorepo 结构，包含 NestJS API、Next.js Web 前端和 Python AI Worker。

## 功能特性

- 私有访问控制：支持管理员 Token 和访客 Token。
- 媒体上传与管理：图片、GIF、视频、音频统一管理。
- 图片广场：响应式瀑布流/比例网格展示，支持移动端优化。
- 原图与派生图：支持缩略图、预览图和原图访问。
- 分组与二级分组：支持图片移动、排序、随机轮换。
- LexoRank 风格排序：图片顺序使用 `rank_key`，支持拖动调整展示顺序。
- 标签系统：支持创建、添加、删除标签。
- 搜索：基于 Meilisearch 的文件名和标签搜索。
- 回收站：删除后可恢复或清理。
- 下载链接：支持临时下载和永久下载链接管理。
- 访问统计：记录浏览量、下载量等访问数据。
- 相似度审核：AI Worker 可辅助扫描相似资源。
- 管理后台：上传、媒体管理、分组、标签、Token、统计、备份等页面。

## 技术栈

- Monorepo: npm workspaces
- API: NestJS, Fastify, Prisma
- Web: Next.js, React, Tailwind CSS, Zustand
- Worker: Python
- Database: MariaDB/MySQL
- Cache/Queue: Redis, BullMQ
- Search: Meilisearch
- Process Manager: PM2
- Reverse Proxy: Nginx

## 目录结构

```text
.
├── apps
│   ├── api          # NestJS API
│   ├── web          # Next.js Web
│   └── worker-ai    # Python AI Worker
├── packages
│   └── shared       # 前后端共享类型与常量
├── infra
│   ├── docker       # Docker 编排示例
│   └── nginx        # Nginx 配置示例
├── docs             # 项目文档
├── package.json
└── package-lock.json
```

## 快速开始

```bash
npm install
cp .env.example .env
npm run db:generate
npm run build
```

首次启动 API 时，如果数据库为空，会自动执行 Prisma `db push` 初始化表结构。

开发模式：

```bash
npm run dev
```

生产部署请参考：

- [Linux 源码部署指南](./DEPLOY_SOURCE_LINUX.md)

## 常用命令

```bash
npm run build:api
npm run build:web
npm run db:generate
npm run db:push
npm run db:seed
```

## 环境变量

复制 `.env.example` 为 `.env`，并按实际环境配置：

- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `MEILISEARCH_HOST`
- `MEILISEARCH_API_KEY`
- `STORAGE_ROOT`
- `WEB_URL`
- `API_URL`

不要把生产 `.env`、数据库密码、Redis 密码、Meilisearch Key 或管理员 Token 提交到 GitHub。

## License

Private project. 请按你的实际授权方式补充许可证。
