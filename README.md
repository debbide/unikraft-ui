# Unikraft UI

## 镜像转换前解析 AMD64 镜像

转换任务会在拉取前查询镜像 manifest，锁定 `linux/amd64` 对应的具体 digest，随后使用
`docker pull --platform linux/amd64 image@sha256:...` 拉取，并且 Dockerfile 也引用这个
digest，避免宿主机默认平台或多架构 tag 再次选错镜像。

也可以在部署机上单独查询某个镜像的 AMD64 编号：

```bash
npm run resolve:amd64 -- nginx:latest
# platform=linux/amd64
# digest=sha256:...
# image=nginx@sha256:...
```

该脚本优先使用 `docker manifest inspect --verbose`，不支持时自动回退到不带 `--verbose`
的 `docker manifest inspect`；如果 registry 不返回 manifest，则按 `linux/amd64` 拉取后
从 `docker image inspect` 的 `RepoDigests` 读取编号，不依赖 Docker Buildx。执行前请确认
Docker daemon 可访问，并且已对私有 registry 完成 `docker login`。
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Production deployment

The application uses Next.js Server Actions. Before publishing production images,
create a repository Actions secret named `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
```

Keep this secret stable across builds and replicas. The Docker workflow injects it
only during `next build`, and the resulting image embeds the matching references.
After replacing an image, recreate the container and refresh any browser tabs that
were opened against the previous deployment; old tabs can contain obsolete Action
IDs and report `Failed to find Server Action` once.

### Image conversion architectures

Docker image conversion builds both Unikraft Cloud architectures by default:

```yaml
environment:
  UNIKRAFT_BUILD_ARCH: "x86_64,arm64"
```

This works when the UI container runs on an ARM64 host. A normal `docker pull` and
`docker image inspect` only show the host-selected child image, but the generated
Dockerfile uses the resolved `linux/amd64` digest as its source. The
source tag must publish a `linux/amd64` manifest. Override the variable with
`x86_64` or `arm64` only when selecting the output Unikraft target; it does not
change the source-image lookup, which is intentionally fixed to AMD64.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# Web SSH

运行中的 Debian SSH 实例会显示“终端”按钮。应用服务器先通过 TLS 连接实例域名的 `2222` 端口，再以 `root` 用户建立 SSH 会话，等价于 `sshpass` 配合 `ncat --ssl` 的连接方式。

1. SSH 密码通过 `UNIKRAFT_SSH_PASSWORD` 配置，未设置时默认为 `unikraft`。
2. 目标域名由服务端根据当前账号可访问的实例动态解析，浏览器不能指定 SSH 主机或端口。
3. 反向代理必须支持 `/ws/ssh` 的 WebSocket Upgrade，并保留 `Host`、`X-Forwarded-Host` 和 `X-Forwarded-Proto` 请求头。

容器不需要私钥挂载、`ncat`、`sshpass`、`privileged`、`NET_ADMIN`、host network 或额外端口。外层 TLS 连接仍会验证实例域名和证书；SSH 层不额外校验主机密钥，与 `StrictHostKeyChecking=no` 的行为一致。
