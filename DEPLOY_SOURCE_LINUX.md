# Linux 源码部署指南（非 Docker）

本文档说明如何在 Linux 服务器上通过源码部署 ImageHub。示例基于 Debian 12，其他发行版可按等价命令调整。

## 1. 系统依赖

建议版本：

- Debian 12
- Node.js 20 LTS 或更新 LTS
- npm 10+
- MariaDB 10.11+ 或 MySQL 8+
- Redis 7+
- Meilisearch 1.x
- Python 3.11+
- Nginx
- PM2
- Certbot

安装基础依赖：

```bash
apt update
apt install -y curl git build-essential nginx mariadb-server redis-server python3 python3-venv python3-pip certbot python3-certbot-nginx
```

安装 Node.js 20：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

安装 PM2：

```bash
npm install -g pm2
```

## 2. 创建数据库

登录 MariaDB：

```bash
mariadb
```

创建数据库和用户：

```sql
CREATE DATABASE imagehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'imagehub'@'localhost' IDENTIFIED BY 'CHANGE_ME_RUNTIME_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON imagehub.* TO 'imagehub'@'localhost';

CREATE USER 'imagehub_migrator'@'localhost' IDENTIFIED BY 'CHANGE_ME_MIGRATION_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON imagehub.* TO 'imagehub_migrator'@'localhost';

FLUSH PRIVILEGES;
EXIT;
```

注意：

- 日常 API 只使用 `imagehub` 运行账号，不需要 root，也不需要建表/改表权限。
- `imagehub_migrator` 只用于首次初始化或升级 schema。初始化完成后可以锁定、改密或临时启用。
- 项目不会默认在 API 启动时自动建表。空库需要先执行 `npm run db:push`。

## 3. 配置 Redis

编辑 Redis 配置：

```bash
nano /etc/redis/redis.conf
```

建议设置：

```conf
bind 127.0.0.1 ::1
protected-mode yes
requirepass CHANGE_ME_REDIS_PASSWORD
```

重启 Redis：

```bash
systemctl restart redis-server
systemctl enable redis-server
```

## 4. 安装 Meilisearch

安装 Meilisearch：

```bash
curl -L https://install.meilisearch.com | sh
mv meilisearch /usr/local/bin/
```

创建 systemd 服务：

```bash
useradd --system --home /var/lib/meilisearch --shell /usr/sbin/nologin meilisearch
mkdir -p /var/lib/meilisearch
chown -R meilisearch:meilisearch /var/lib/meilisearch
nano /etc/systemd/system/meilisearch.service
```

写入：

```ini
[Unit]
Description=Meilisearch
After=network.target

[Service]
User=meilisearch
Group=meilisearch
ExecStart=/usr/local/bin/meilisearch --http-addr 127.0.0.1:7700 --db-path /var/lib/meilisearch --master-key CHANGE_ME_MEILI_MASTER_KEY
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

启动：

```bash
systemctl daemon-reload
systemctl enable --now meilisearch
```

## 5. 获取源码

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/YOUR_ORG/YOUR_REPO.git imagehub
cd /opt/imagehub
```

如果是手动上传源码，确保目录结构保持完整，不要把文件散落到 `src` 根目录。

## 6. 配置环境变量

```bash
cp .env.example .env
nano .env
```

生产示例：

```env
APP_PORT=3001
NODE_ENV=production

WEB_URL=https://your-domain.example
API_URL=https://your-domain.example/api/v1

DATABASE_URL=mysql://imagehub:CHANGE_ME_RUNTIME_PASSWORD@localhost:3306/imagehub
MIGRATION_DATABASE_URL=mysql://imagehub_migrator:CHANGE_ME_MIGRATION_PASSWORD@localhost:3306/imagehub
AUTO_INIT_DB=false

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=CHANGE_ME_MEILI_MASTER_KEY
MEILISEARCH_INDEX_PREFIX=imagehub_

STORAGE_ROOT=/opt/imagehub/storage

DOWNLOAD_TEMP_EXPIRE_MINUTES=5
DOWNLOAD_BATCH_MAX_EXPIRE_MINUTES=30
UPLOAD_MAX_FILE_SIZE_MB=200
```

保护配置文件：

```bash
chmod 600 .env
```

## 7. 安装依赖

```bash
npm install
```

安装 Python Worker 依赖：

```bash
cd /opt/imagehub/apps/worker-ai
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
deactivate
cd /opt/imagehub
```

## 8. 初始化数据库

```bash
npm run db:generate
npm run db:push
```

`db:push` 会优先使用 `MIGRATION_DATABASE_URL`，因此可以把 API 常驻运行的 `DATABASE_URL` 保持为低权限账号。

如项目需要初始化种子数据：

```bash
npm run db:seed
```

`db:seed` 使用 `DATABASE_URL`，只需要普通写入权限。

## 9. 构建项目

```bash
npm run build:api
npm run build:web
```

构建产物：

- API: `apps/api/dist`
- Web: `apps/web/.next`
- Shared package: `packages/shared/dist`

## 10. 配置 PM2

项目根目录已提供 `ecosystem.config.js` 示例。确认其中路径与端口正确：

- API: `node apps/api/dist/src/main.js`
- Web: `apps/web/.next/standalone/apps/web/server.js`
- Worker: `apps/worker-ai/.venv/bin/python main.py`

启动：

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

查看状态：

```bash
pm2 list
pm2 logs imagehub-api
pm2 logs imagehub-web
pm2 logs imagehub-worker-ai
```

## 11. 配置 Nginx

示例：

```nginx
server {
    listen 80;
    server_name your-domain.example;

    client_max_body_size 200m;

    location /api/v1/ {
        proxy_pass http://127.0.0.1:3001/api/v1/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

```bash
nginx -t
systemctl reload nginx
```

## 12. 配置 HTTPS

```bash
certbot --nginx -d your-domain.example
```

检查自动续期：

```bash
certbot renew --dry-run
```

## 13. 部署更新流程

```bash
cd /opt/imagehub
git pull
npm install
npm run db:generate
npm run build:api
npm run build:web
pm2 restart imagehub-api imagehub-web --update-env
pm2 restart imagehub-worker-ai --update-env
```

首次启动 API 时会自动初始化空数据库的表结构，不需要再手动执行 `db:migrate`。

## 14. 清理构建和缓存

如果要把目录恢复成接近纯源码状态，可以停止 PM2 后清理：

```bash
pm2 stop imagehub-api imagehub-web imagehub-worker-ai
rm -rf apps/api/dist
rm -rf apps/web/.next
rm -rf packages/shared/dist
rm -rf node_modules
rm -rf apps/worker-ai/.venv
find . -type d -name .cache -prune -exec rm -rf {} +
find . -type d -name __pycache__ -prune -exec rm -rf {} +
find . -type d -name .pytest_cache -prune -exec rm -rf {} +
```

清理后需要重新执行依赖安装、构建和 PM2 启动步骤。

不要删除：

- `.env`，除非已经备份。
- `storage/`，这里保存上传的原图和派生文件。
- 数据库、Redis、Meilisearch 数据目录，除非明确要重置系统。

## 15. 常见问题

### 图片无法打开

检查：

```bash
ls -la /opt/imagehub/storage
pm2 logs imagehub-api
```

确认 `.env` 中 `STORAGE_ROOT` 指向正确目录。

### 搜索没有结果

检查 Meilisearch：

```bash
systemctl status meilisearch
curl http://127.0.0.1:7700/health
```

确认 `.env` 中 `MEILISEARCH_HOST` 和 `MEILISEARCH_API_KEY` 正确。

### Web 访问 502

检查：

```bash
pm2 list
pm2 logs imagehub-web
nginx -t
```

### API 访问 502

检查：

```bash
pm2 logs imagehub-api
ss -tulpn | grep 3001
```

### 上传失败

检查 Nginx `client_max_body_size`、`.env` 中 `UPLOAD_MAX_FILE_SIZE_MB`，以及 `storage/` 权限。
