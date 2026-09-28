# OfferTrack 总体部署方案

## 1. 当前结论

当前服务器为 Ubuntu 24.04、2 核 CPU、2 GiB 内存、40 GiB ESSD。该配置足以供固定少量用户运行一套 OfferTrack 生产环境，但不建议同时常驻生产和测试两套 Next.js + SQLite 容器。

- 服务器：只运行生产环境，应用监听 `127.0.0.1:3000`，由 Nginx 对外提供 80/443 端口。
- 测试：继续在开发电脑完成；必要时可在服务器临时启动测试容器，验证后立即关闭。
- 数据库：继续使用现有 `data/offertrack.db`，上线前迁移并上传到服务器持久化目录。
- Git：Public 仓库只保存代码。数据库、备份、`.env`、SSH 私钥和任何密码都不得提交。
- 备份：第一阶段保存在服务器 `/opt/offertrack-prod/backups`，后续再增加异地备份。

不使用 `/test` 子路径部署测试站点。Next.js 子路径需要额外的 `basePath` 构建配置，而且同机测试会挤占 2 GiB 内存。

## 2. 无域名阶段的限制

可以临时通过 `http://<SERVER_IP>` 访问，但 HTTP 不加密，登录密码和业务数据可能在传输途中被窃取。因此：

1. 只用于短期部署验证；
2. `.env` 临时设置 `OFFERTRACK_SECURE_COOKIES=false`；
3. 正式多人使用前应购买域名、完成备案要求（如适用）并启用 HTTPS，随后改成 `OFFERTRACK_SECURE_COOKIES=true`；
4. 如果近期不买域名，建议使用 Tailscale/WireGuard 等私有网络访问，不直接向公网开放 80 端口。

## 3. 生产架构

```text
用户浏览器
    |
    v
Nginx :80 / :443
    |
    v
OfferTrack 容器 127.0.0.1:3000
    |
    +-- /opt/offertrack-prod/data/offertrack.db
    +-- /opt/offertrack-prod/backups/*.db
```

推荐目录：

```text
/opt/offertrack-prod/
├── app/                 # Git 工作副本
├── data/                # 生产 SQLite 持久化目录
├── backups/             # 本机一致性快照
└── .env                 # 仅服务器保存，权限 600
```

## 4. 账号与个人空间

- 首次部署通过环境变量创建唯一管理员账号。
- 不开放公众注册；管理员在“设置 → 团队账号”中创建固定成员。
- 新账号使用临时密码，第一次登录必须修改。
- 密码使用 `scrypt` 加盐哈希保存，数据库中不保存明文密码。
- 会话使用随机令牌，浏览器仅保存 `HttpOnly` Cookie。
- 每个账号自动创建独立 Workspace；全部 Workspace、岗位、Timeline 接口均校验所有权。
- 管理员可以创建/停用账号、重置临时密码以及导出/恢复全库备份。

## 5. 首次部署步骤

### 5.1 云平台设置

- 立即更换曾在聊天中发送过的 root 密码。
- 安全组仅开放 `22/tcp` 和临时的 `80/tcp`；不要开放 3000 端口。
- 确认公网带宽已启用。订单中的“0 Kbps，按流量计费”需要在云控制台确认公网出方向可用，否则即使服务启动也无法访问。
- 创建普通部署账号，加入 `sudo` 和 `docker` 组；配置 SSH 公钥后禁用 root 密码远程登录。

### 5.2 安装基础软件

安装 Git、Docker Engine、Docker Compose Plugin 和 Nginx。2 GiB 内存建议额外建立 2 GiB swap，以降低首次镜像构建时内存不足的风险。

### 5.3 获取代码并创建目录

```bash
sudo mkdir -p /opt/offertrack-prod/{data,backups}
sudo chown -R <DEPLOY_USER>:<DEPLOY_USER> /opt/offertrack-prod
git clone <REPOSITORY_SSH_URL> /opt/offertrack-prod/app
cd /opt/offertrack-prod/app
```

将 `docker-compose.yml` 中两个宿主机卷改为绝对路径，或在 `app` 目录创建指向上述 `data`、`backups` 的目录。生产数据库最终路径必须对应容器内 `/app/data/offertrack.db`。

### 5.4 初始化环境变量

在服务器创建 `.env`，不要通过聊天发送真实密码：

```dotenv
OFFERTRACK_ADMIN_USERNAME=<ADMIN_USERNAME>
OFFERTRACK_ADMIN_DISPLAY_NAME=<ADMIN_DISPLAY_NAME>
OFFERTRACK_ADMIN_PASSWORD=<LONG_UNIQUE_INITIAL_PASSWORD>
OFFERTRACK_SECURE_COOKIES=false
OFFERTRACK_DATA_DIR=/opt/offertrack-prod/data
OFFERTRACK_BACKUP_DIR=/opt/offertrack-prod/backups
```

执行 `chmod 600 .env`。首次启动创建管理员后，可从 `.env` 删除三项管理员初始化变量；后续 seed 不会覆盖管理员密码。

### 5.5 上传现有数据库

先停掉本机应用并生成一致性备份：

```powershell
npm run db:backup
```

再使用 `scp` 将最新备份上传为服务器的 `/opt/offertrack-prod/data/offertrack.db`。上传完成后确认文件所有者与容器内 `node` 用户（通常 UID/GID 1000）一致，且文件不允许其他用户读取。

### 5.6 启动生产服务

```bash
cd /opt/offertrack-prod/app
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 offertrack
```

容器启动时自动执行 Prisma 迁移和管理员初始化，然后启动 Next.js。应用端口只绑定到服务器回环地址。

### 5.7 配置 Nginx

复制 `deploy/nginx/offertrack.conf` 到 `/etc/nginx/sites-available/offertrack`，禁用 Ubuntu 自带的 `default` 站点并启用本配置后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

完成域名和证书配置后，将 Nginx 重定向到 HTTPS，并把 `.env` 中安全 Cookie 改为 `true` 后重启容器。

## 6. 本机备份

应用提供管理员手动下载备份，也提供容器内一致性备份命令：

```bash
docker compose exec offertrack npm run db:backup
```

备份通过 SQLite Online Backup API 生成，避免数据库正在写入时直接 `cp` 导致快照不一致。建议每天定时执行，初期保留最近 30 份；本机备份无法应对云盘或整台服务器故障，稳定后必须增加另一台设备或对象存储的异地副本。

## 7. 发布与回滚

日常开发在本机分支完成并运行类型检查、测试和生产构建。通过后合并到 `main`，服务器执行：

```bash
cd /opt/offertrack-prod/app
npm run db:backup
git pull --ff-only
docker compose build
docker compose up -d
```

代码回滚使用已知正常的 Git 提交重新构建。数据库迁移可能不可逆，因此发布前的 SQLite 备份是数据库回滚依据。

## 8. 上线前验收

- 管理员登录、修改密码、退出；
- 管理员创建成员并设置临时密码；
- 成员首次登录强制改密；
- 两个成员互相看不到对方 Workspace；
- 新增、编辑、移动、导入、导出岗位；
- 管理员下载备份，并在隔离副本上验证恢复；
- 重启容器后数据仍存在；
- 安全组未开放 3000，Git 仓库中无 `.env`、数据库和备份。
