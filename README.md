# OfferTrack

OfferTrack 是一个面向少量固定成员的招聘信息管理系统，支持 Workspace、岗位看板、招聘 Timeline、Excel 导入导出、账号登录和个人数据空间。

## 技术栈

- Next.js 16 / React 19 / TypeScript
- Prisma 7
- SQLite
- Docker Compose + Nginx

## 本地开发

要求 Node.js `>= 20.19.0`。

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run dev
```

全新数据库还需要在当前终端设置三个 `OFFERTRACK_ADMIN_*` 环境变量，然后运行 `npm run db:seed` 创建首个管理员。不要把真实密码写入仓库。

## 验证

```bash
npm run typecheck
npm run build
npm run test:auth
npm run db:verify
```

其他业务模块测试命令参见 `package.json`。

## 部署

生产部署步骤、服务器配置建议、无域名阶段的限制和备份策略见 [OfferTrack_总体部署方案.md](OfferTrack_总体部署方案.md)。

数据库、备份、`.env` 和私有数据导入脚本不会提交到 Git。
