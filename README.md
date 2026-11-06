## 介绍

一个使用 Cloudflare Pages、Pages Functions 和 D1 创建的 URL 缩短器。

*演示站点*：[linklet.pages.dev](https://linklet.pages.dev)

## 功能

- 网页端生成短链接，支持随机 slug 和自定义 slug
- 短链接访问统计，记录来源、User-Agent 和 IP
- 独立管理后台 `/admin`，支持搜索、新增、编辑、启用/停用和删除链接
- 管理后台使用 Cloudflare 密钥 `ADMIN_PASSWORD` 登录，不在公开页面提供入口

## 部署

### 1. 创建 Cloudflare Pages 项目

1. Fork [linklet 仓库](https://github.com/HarrisonWang/linklet.git)。
2. 登录 [Cloudflare](https://dash.cloudflare.com) 控制台。
3. 进入 <kbd>Workers & Pages</kbd> → <kbd>Create application</kbd> → <kbd>Pages</kbd> → <kbd>Connect to Git</kbd>。
4. 选择 Fork 后的仓库并完成构建配置。本项目不需要构建命令，输出目录填写 `/`。

### 2. 创建 D1 数据库

1. 进入 <kbd>Workers & Pages</kbd> → <kbd>D1</kbd> → <kbd>Create database</kbd>。
2. 输入数据库名称，例如 `linklet`，点击 <kbd>Create</kbd>。
3. 打开数据库控制台，执行 [`short.sql`](./short.sql) 中的 SQL 创建数据表。

> `short.sql` 包含 `DROP TABLE`，只用于首次初始化。已有数据的数据库不要重复执行。

### 3. 绑定数据库和管理员密码

进入 Pages 项目 <kbd>Settings</kbd> → <kbd>Functions</kbd>，添加 D1 绑定：

| Variable name | D1 database |
| :------------ | :---------- |
| DB            | linklet     |

进入 <kbd>Settings</kbd> → <kbd>Environment variables</kbd>，添加加密变量：

| Variable name | 值 |
| :------------ | :--- |
| ADMIN_PASSWORD | 你的高强度管理员密码 |

也可以在项目目录使用 Wrangler 设置：

```bash
wrangler pages secret put ADMIN_PASSWORD --project-name <你的 Pages 项目名>
```

设置或修改 ADMIN_PASSWORD 后必须重新部署项目，新的密钥才会生效。

### 4. 使用管理后台

部署完成后直接访问：

```text
https://<你的域名>/admin
```

输入 `ADMIN_PASSWORD` 对应的密码即可登录。公开首页不显示后台入口，后台会话使用 HttpOnly、SameSite=Strict 的签名 Cookie，默认有效期 12 小时。修改 `ADMIN_PASSWORD` 后，所有旧会话会自动失效。

## API 生成短网址

### 随机短链接

```http
POST https://linklet.pages.dev/create
Content-Type: application/json

{
  "url": "https://ollama.com/blog/how-to-prompt-code-llama"
}
```

### 指定 slug

```http
POST https://linklet.pages.dev/create
Content-Type: application/json

{
  "url": "https://ollama.com/blog/how-to-prompt-code-llama",
  "slug": "llama"
}
```

slug 长度为 2-32 个字符，只允许字母、数字、下划线和连字符。`admin`、`api`、`create` 等系统路径为保留 slug。

响应：

```json
{
  "slug": "llama",
  "link": "https://linklet.pages.dev/llama"
}
```

## 本地开发

1. 安装依赖，并复制本地 Wrangler 配置：

```bash
npm install
cp wrangler.toml.example wrangler.toml
```

仅本地开发时，`wrangler.toml` 中的 `database_id` 可以使用示例占位值；需要连接 Cloudflare 远程 D1 时，请替换为控制台中显示的真实 Database ID。

2. 在项目根目录创建 `.dev.vars`（该文件已被 Git 忽略）：

```dotenv
ADMIN_PASSWORD=local-admin-password
```

3. 初始化本地 D1 数据库并启动开发服务器：

```bash
npm run d1
npm run dev
```

4. 访问 `http://localhost:8788/admin` 登录后台。
