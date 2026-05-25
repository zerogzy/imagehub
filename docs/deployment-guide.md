# ImageHub Linux 源码编译部署教程

> 本教程指导你在 Linux 服务器上从源码编译并部署 ImageHub 私有媒体图床系统。
> 适用于 Ubuntu 20.04+ / Debian 11+ / CentOS 8+ 等 Linux 发行版。

---

## 目录

- [系统架构概览](#系统架构概览)
- [方式一：Docker Compose 一键部署（推荐）](#方式一docker-compose-一键部署推荐)
- [方式二：手动编译部署](#方式二手动编译部署)
  - [1. 系统依赖安装](#1-系统依赖安装)
  - [2. 基础设施部署](#2-基础设施部署)
  - [3. 获取源码](#3-获取源码)
  - [4. 编译共享包](#4-编译共享包)
  - [5. 编译与部署 API 服务](#5-编译与部署-api-服务)
  - [6. 编译与部署 Web 前端](#6-编译与部署-web-前端)
  - [7. 部署 AI Worker（可选）](#7-部署-ai-worker可选)
  - [8. 配置 Nginx 反向代理](#8-配置-nginx-反向代理)
  - [9. 配置 Systemd 服务](#9-配置-systemd-服务)
- [数据库初始化](#数据库初始化)
- [首次使用](#首次使用)
- [HTTPS 配置](#https-配置)
- [备份与恢复](#备份与恢复)
- [常见问题](#常见问题)

---

## 系统架构概览

```
                        ┌──────────────┐
                        │   Nginx :80  │
                        │  (反向代理)   │
                        └──────┬───────┘
                               │
                 ┌─────────────┼──────────────┐
                 │             │              │
          ┌──────▼──────┐ ┌───▼──────┐ ┌─────▼──────┐
          │  Next.js     │ │ NestJS   │ │  AI Worker │
          │  Web :3000   │ │ API :3001│ │  :8000     │
          └──────┬───────┘ └──┬───────┘ └─────┬──────┘
                 │            │               │
          ┌──────▼────────────▼───────────────▼──────┐
          │              /storage (文件系统)           │
          └─────────────────────┬───────────────────┘
                                │
                 ┌──────────────┼──────────────┐
                 │              │              │
          ┌──────▼──────┐ ┌───▼───────┐ ┌────▼───────┐
          │  MySQL 8    │ │  Redis 7  │ │Meilisearch │
          │  :3306      │ │  :6379    │ │  :7700     │
          └─────────────┘ └───────────┘ └────────────┘
```

**技术栈**：

| 组件 | 技术栈 | 端口 |
|------|--------|------|
| Web 前端 | Next.js 15 + React 19 + Tailwind CSS | 3000 |
| API 后端 | NestJS + Fastify + Prisma + BullMQ | 3001 |
| AI Worker | Python + FastAPI + imagehash + OpenCV | 8000 |
| 数据库 | MySQL 8.0 | 3306 |
| 缓存/队列 | Redis 7 | 6379 |
| 搜索引擎 | Meilisearch v1.11 | 7700 |
| 反向代理 | Nginx | 80/443 |

---

## 方式一：Docker Compose 一键部署（推荐）

> 最快部署方式，无需手动编译，适合快速上线。

### 1. 安装 Docker 和 Docker Compose

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录终端使 docker 组生效

# 验证安装
docker --version
docker compose version
```

### 2. 获取源码

```bash
git clone <your-repo-url> /opt/imagehub
cd /opt/imagehub
```

### 3. 配置环境变量

```bash
cp .env.example .env
vim .env
```

修改以下关键变量（**生产环境务必修改密码**）：

```bash
# MySQL 密码（必须修改）
MYSQL_ROOT_PASSWORD=your_strong_root_password
MYSQL_PASSWORD=your_strong_imagehub_password
DATABASE_URL=mysql://imagehub:your_strong_imagehub_password@mysql:3306/imagehub

# Redis 密码（必须修改）
REDIS_PASSWORD=your_strong_redis_password

# Meilisearch 密钥（必须修改）
MEILISEARCH_API_KEY=your_meili_master_key

# 存储路径
STORAGE_ROOT=/app/storage
```

### 4. 启动所有服务

```bash
# 构建并启动
docker compose -f infra/docker/docker-compose.yml up -d --build

# 查看启动日志
docker compose -f infra/docker/docker-compose.yml logs -f
```

### 5. 初始化数据库

```bash
# 等待 MySQL 健康检查通过后执行
docker exec -it imagehub-api npx prisma migrate deploy
docker exec -it imagehub-api npx prisma db seed
```

### 6. 验证部署

```bash
# 检查所有容器状态
docker compose -f infra/docker/docker-compose.yml ps

# 测试 API
curl http://localhost/api/v1/me
# 应返回 401 Unauthorized（未携带 Token）

# 测试 Web
curl -I http://localhost/
# 应返回 200 OK
```

---

## 方式二：手动编译部署

> 适合需要精细控制、自定义配置或无法使用 Docker 的环境。

### 1. 系统依赖安装

#### Ubuntu / Debian

```bash
sudo apt update && sudo apt install -y \
  curl wget git build-essential \
  nginx pkg-config libvips-dev
```

#### CentOS / RHEL

```bash
sudo dnf install -y \
  curl wget git gcc-c++ make \
  nginx pkgconfig vips-devel
```

### 2. 基础设施部署

#### 2.1 安装 Node.js 20

```bash
# 使用 NodeSource 安装 Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证
node -v   # v20.x.x
npm -v    # 10.x.x
```

#### 2.2 安装 MySQL 8.0

```bash
# Ubuntu
sudo apt install -y mysql-server

# 启动并设置开机自启
sudo systemctl enable --now mysql

# 安全初始化
sudo mysql_secure_installation

# 创建数据库和用户
sudo mysql -u root -p <<EOF
CREATE DATABASE imagehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'imagehub'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON imagehub.* TO 'imagehub'@'localhost';
FLUSH PRIVILEGES;
EOF
```

#### 2.3 安装 Redis 7

```bash
# Ubuntu
sudo apt install -y redis-server

# 配置密码
sudo vim /etc/redis/redis.conf
# 修改: requirepass your_strong_redis_password

# 重启
sudo systemctl enable --now redis-server

# 验证
redis-cli -a your_strong_redis_password ping
# 应返回 PONG
```

#### 2.4 安装 Meilisearch

```bash
# 下载最新稳定版
curl -L https://install.meilisearch.com | sh
sudo mv meilisearch /usr/local/bin/

# 创建数据目录
sudo mkdir -p /var/lib/meilisearch
sudo chown $USER:$USER /var/lib/meilisearch

# 创建 Systemd 服务
sudo tee /etc/systemd/system/meilisearch.service <<'EOF'
[Unit]
Description=Meilisearch Search Engine
After=network.target

[Service]
Type=simple
User=www-data
Environment=MEILI_MASTER_KEY=your_meili_master_key
Environment=MEILI_ENV=production
Environment=MEILI_DB_PATH=/var/lib/meilisearch
ExecStart=/usr/local/bin/meilisearch --http-addr 127.0.0.1:7700
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo chown -R www-data:www-data /var/lib/meilisearch
sudo systemctl daemon-reload
sudo systemctl enable --now meilisearch

# 验证
curl http://127.0.0.1:7700/health
# 应返回 {"status":"available"}
```

#### 2.5 安装 Python 3.12（AI Worker 需要）

```bash
# Ubuntu 22.04+ 可直接安装
sudo apt install -y python3 python3-pip python3-venv

# 或者使用 deadsnakes PPA（Ubuntu 20.04）
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt install -y python3.12 python3.12-venv python3.12-dev
```

### 3. 获取源码

```bash
# 创建应用目录
sudo mkdir -p /opt/imagehub
sudo chown $USER:$USER /opt/imagehub

# 克隆代码
git clone <your-repo-url> /opt/imagehub
cd /opt/imagehub
```

### 4. 配置环境变量

```bash
cp .env.example .env
vim .env
```

修改为本地基础设施的连接信息：

```bash
# ---- App ----
APP_PORT=3001
NODE_ENV=production

# ---- Web ----
WEB_URL=http://your-domain.com
API_URL=http://127.0.0.1:3001

# ---- MySQL ----
DATABASE_URL=mysql://imagehub:your_strong_password@127.0.0.1:3306/imagehub

# ---- Redis ----
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_strong_redis_password

# ---- Meilisearch ----
MEILISEARCH_HOST=http://127.0.0.1:7700
MEILISEARCH_API_KEY=your_meili_master_key

# ---- Storage ----
STORAGE_ROOT=/opt/imagehub/storage
```

### 5. 编译共享包

> `@imagehub/shared` 是 API 和 Web 共用的 TypeScript 类型/常量包，必须先编译。

```bash
cd /opt/imagehub

# 安装全部依赖
npm install

# 编译共享包
npm run build -w packages/shared
```

### 6. 编译与部署 API 服务

```bash
cd /opt/imagehub

# 生成 Prisma Client
npm run db:generate -w apps/api

# 执行数据库迁移
npm run db:migrate:prod -w apps/api

# 编译 NestJS
npm run build -w apps/api

# 编译产物位于 apps/api/dist/
```

#### 创建存储目录

```bash
mkdir -p /opt/imagehub/storage/{original,preview,video,audio,exports/backup,exports/batch-download,temp/upload,temp/zip}
```

#### 手动启动测试

```bash
cd /opt/imagehub
NODE_ENV=production node apps/api/dist/main.js

# 应看到输出：
# 🚀 ImageHub API running on http://localhost:3001
# 📚 Swagger docs at http://localhost:3001/api/docs
```

确认正常后按 `Ctrl+C` 停止，后续用 Systemd 管理。

### 7. 编译与部署 Web 前端

```bash
cd /opt/imagehub

# 编译 Next.js（standalone 模式）
npm run build -w apps/web

# 编译产物位于 apps/web/.next/standalone/
```

#### 手动启动测试

```bash
cd /opt/imagehub
PORT=3000 HOSTNAME=0.0.0.0 API_URL=http://127.0.0.1:3001 node apps/web/.next/standalone/apps/web/server.js

# 应在 http://localhost:3000 可访问
```

### 8. 部署 AI Worker（可选）

> AI Worker 用于图片相似度分析，如果不使用此功能可以跳过。

```bash
cd /opt/imagehub/apps/worker-ai

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 手动启动测试
API_URL=http://127.0.0.1:3001/api/v1 STORAGE_ROOT=/opt/imagehub/storage python main.py

# 应看到输出：
# INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 9. 配置 Nginx 反向代理

#### 创建 Nginx 配置

```bash
sudo tee /etc/nginx/sites-available/imagehub <<'EOF'
# ImageHub Nginx Configuration
# 替换 your-domain.com 为你的域名或 IP

upstream imagehub_api {
    server 127.0.0.1:3001;
}

upstream imagehub_web {
    server 127.0.0.1:3000;
}

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=upload:10m rate=5r/s;

server {
    listen 80;
    server_name your-domain.com;

    # Max upload size
    client_max_body_size 200M;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # API proxy
    location /api/ {
        proxy_pass http://imagehub_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        limit_req zone=api burst=20 nodelay;
    }

    # Upload endpoint with stricter rate limit
    location /api/v1/admin/upload {
        proxy_pass http://imagehub_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;

        limit_req zone=upload burst=10 nodelay;
    }

    # Everything else -> Next.js
    location / {
        proxy_pass http://imagehub_web;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
```

#### 启用站点

```bash
sudo ln -sf /etc/nginx/sites-available/imagehub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重载
sudo systemctl reload nginx
```

### 10. 配置 Systemd 服务

#### API 服务

```bash
sudo tee /etc/systemd/system/imagehub-api.service <<'EOF'
[Unit]
Description=ImageHub API Server (NestJS)
After=network.target mysql.service redis.service
Wants=mysql.service redis.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/imagehub
EnvironmentFile=/opt/imagehub/.env
ExecStart=/usr/bin/node apps/api/dist/main.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# 安全限制
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/imagehub/storage /opt/imagehub/apps/api/prisma

[Install]
WantedBy=multi-user.target
EOF
```

#### Web 服务

```bash
sudo tee /etc/systemd/system/imagehub-web.service <<'EOF'
[Unit]
Description=ImageHub Web Server (Next.js)
After=network.target imagehub-api.service
Wants=imagehub-api.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/imagehub
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=API_URL=http://127.0.0.1:3001
ExecStart=/usr/bin/node apps/web/.next/standalone/apps/web/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
```

#### AI Worker 服务（可选）

```bash
sudo tee /etc/systemd/system/imagehub-worker-ai.service <<'EOF'
[Unit]
Description=ImageHub AI Similarity Worker
After=network.target imagehub-api.service
Wants=imagehub-api.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/imagehub/apps/worker-ai
Environment=API_URL=http://127.0.0.1:3001/api/v1
Environment=STORAGE_ROOT=/opt/imagehub/storage
Environment=WORKER_HOST=0.0.0.0
Environment=WORKER_PORT=8000
ExecStart=/opt/imagehub/apps/worker-ai/venv/bin/python main.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/imagehub/storage

[Install]
WantedBy=multi-user.target
EOF
```

#### 设置权限并启动

```bash
# 将存储目录和运行目录赋予 www-data 用户
sudo chown -R www-data:www-data /opt/imagehub/storage
sudo chown -R www-data:www-data /opt/imagehub/apps/api/dist
sudo chown -R www-data:www-data /opt/imagehub/apps/web/.next

# 重新加载 Systemd
sudo systemctl daemon-reload

# 启动服务
sudo systemctl enable --now imagehub-api
sudo systemctl enable --now imagehub-web
sudo systemctl enable --now imagehub-worker-ai  # 可选

# 查看状态
sudo systemctl status imagehub-api
sudo systemctl status imagehub-web

# 查看日志
sudo journalctl -u imagehub-api -f
sudo journalctl -u imagehub-web -f
```

---

## 数据库初始化

### 执行迁移

```bash
cd /opt/imagehub

# 生成 Prisma Client
npm run db:generate -w apps/api

# 执行数据库迁移
npm run db:migrate:prod -w apps/api
```

### 初始化种子数据

种子脚本会自动创建管理员 Token 和访客 Token：

```bash
npm run db:seed -w apps/api
```

**输出示例**：

```
🌱 Seeding database...

✅ Admin token created successfully!

⚠️  SAVE THIS TOKEN NOW - IT WILL NOT BE SHOWN AGAIN:
🔑 a1b2c3d4e5f6...（64位十六进制字符串）
📌 Prefix: a1b2c3d4

✅ Visitor token created:
🔑 f6e5d4c3b2a1...（64位十六进制字符串）
📌 Prefix: f6e5d4c3

✅ Sample group created: 示例分组

🎉 Seeding complete!
```

> ⚠️ **务必保存输出的 Token！** Token 哈希存储在数据库中，明文只显示一次。

---

## 首次使用

1. **访问网站**：打开 `http://your-domain.com`
2. **输入 Token**：在登录页面粘贴上面获取的 Admin Token
3. **进入图床**：验证成功后自动跳转到图片广场
4. **管理后台**：以 Admin Token 登录后，右上角出现「设置」图标，点击进入管理后台
5. **上传文件**：管理后台 → 上传中心 → 拖拽或选择文件上传
6. **创建分组/标签**：管理后台 → 分组管理 / 标签管理
7. **创建访客密钥**：管理后台 → 密钥管理 → 创建新密钥（角色选择 visitor），将密钥分享给访客

---

## HTTPS 配置

### 使用 Let's Encrypt 免费证书

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书（替换域名）
sudo certbot --nginx -d your-domain.com

# 自动续期已内置，验证定时任务
sudo systemctl status certbot.timer
```

### 手动配置 HTTPS

如已有证书，修改 Nginx 配置：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # ... 其余 location 配置同上 ...
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

---

## 备份与恢复

### 数据库备份

```bash
# 手动备份
mysqldump -u imagehub -p imagehub > backup_$(date +%Y%m%d).sql

# 自动每日备份（Crontab）
crontab -e
# 添加：
0 2 * * * mysqldump -u imagehub -pyour_password imagehub | gzip > /opt/imagehub/storage/exports/backup/db_$(date +\%Y\%m\%d).sql.gz
```

### 文件备份

```bash
# 存储目录（原图 + 衍生图）
tar czf storage_backup_$(date +%Y%m%d).tar.gz /opt/imagehub/storage/
```

### 恢复

```bash
# 恢复数据库
mysql -u imagehub -p imagehub < backup_20250101.sql

# 恢复文件
tar xzf storage_backup_20250101.tar.gz -C /
```

---

## 常见问题

### Q: API 启动报错 `connect ECONNREFUSED 127.0.0.1:3306`

MySQL 未启动或密码不匹配。检查：

```bash
sudo systemctl status mysql
# 确保 .env 中的 DATABASE_URL 密码与 MySQL 实际密码一致
```

### Q: API 启动报错 `connect ECONNREFUSED 127.0.0.1:6379`

Redis 未启动或密码不匹配。检查：

```bash
sudo systemctl status redis-server
redis-cli -a your_redis_password ping
```

### Q: 上传文件报 413 Request Entity Too Large

Nginx 上传大小限制。修改 Nginx 配置：

```nginx
client_max_body_size 200M;
```

然后 `sudo systemctl reload nginx`。

### Q: 图片缩略图不显示

1. 检查 `storage/preview/` 目录是否存在缩略图文件
2. 确认 Sharp 库正常工作（需要 `libvips-dev` 系统依赖）
3. 查看日志：`sudo journalctl -u imagehub-api | grep derivative`

### Q: Meilisearch 连接失败

1. 检查 Meilisearch 是否运行：`curl http://127.0.0.1:7700/health`
2. 检查 `.env` 中 `MEILISEARCH_API_KEY` 是否与 Meilisearch 的 `MEILI_MASTER_KEY` 一致
3. 搜索功能不影响核心使用，可以后续再修复

### Q: Prisma 迁移报错

```bash
# 重置数据库（谨慎操作，会丢失数据）
cd /opt/imagehub
npx prisma migrate reset --schema apps/api/prisma/schema.prisma

# 重新迁移
npm run db:migrate:prod -w apps/api
```

### Q: 如何查看 API 文档

API 服务启动后，访问 Swagger 文档：

```
http://your-domain.com/api/docs
```

### Q: 如何更新版本

```bash
cd /opt/imagehub

# 拉取最新代码
git pull origin main

# 重新编译
npm run build -w packages/shared
npm run build -w apps/api
npm run build -w apps/web

# 执行数据库迁移
npm run db:migrate:prod -w apps/api

# 重启服务
sudo systemctl restart imagehub-api
sudo systemctl restart imagehub-web
```

### Q: AI Worker 安装 OpenCV 失败

```bash
# Ubuntu 需要安装系统依赖
sudo apt install -y libgl1-mesa-glx libglib2.0-0

# 或者使用 headless 版本（requirements.txt 已使用 opencv-python-headless）
pip install opencv-python-headless
```

---

## 端口速查表

| 端口 | 服务 | 外部访问 |
|------|------|---------|
| 80 | Nginx | ✅ 是 |
| 443 | Nginx (HTTPS) | ✅ 是 |
| 3000 | Next.js Web | ❌ 仅内部 |
| 3001 | NestJS API | ❌ 仅内部 |
| 3306 | MySQL | ❌ 仅内部 |
| 6379 | Redis | ❌ 仅内部 |
| 7700 | Meilisearch | ❌ 仅内部 |
| 8000 | AI Worker | ❌ 仅内部 |

> ⚠️ 生产环境只暴露 80/443 端口，其余端口通过防火墙阻止外部访问。

```bash
# UFW 防火墙示例
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp
sudo ufw deny 3001/tcp
sudo ufw deny 3306/tcp
sudo ufw deny 6379/tcp
sudo ufw deny 7700/tcp
sudo ufw deny 8000/tcp
sudo ufw enable
```

---

## 目录结构

```
/opt/imagehub/
├── .env                          # 环境变量配置
├── package.json                  # Monorepo 根配置
├── apps/
│   ├── api/                      # NestJS 后端
│   │   ├── src/                  # 源码
│   │   ├── dist/                 # 编译产物
│   │   ├── prisma/               # 数据库 Schema & 迁移
│   │   └── package.json
│   ├── web/                      # Next.js 前端
│   │   ├── src/                  # 源码
│   │   ├── .next/                # 编译产物
│   │   └── package.json
│   └── worker-ai/                # Python AI Worker
│       ├── main.py               # 相似度分析服务
│       ├── requirements.txt
│       └── venv/                 # Python 虚拟环境
├── packages/
│   └── shared/                   # 共享类型/常量包
│       ├── src/
│       └── dist/
├── storage/                      # 文件存储
│   ├── original/                 # 原图
│   ├── preview/                  # 缩略图/预览图
│   ├── video/                    # 视频封面
│   ├── audio/                    # 音频波形
│   ├── exports/                  # 导出文件
│   └── temp/                     # 临时文件
└── infra/                        # 基础设施配置
    ├── docker/                   # Docker Compose
    └── nginx/                    # Nginx 配置
```
