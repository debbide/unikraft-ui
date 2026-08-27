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
Dockerfile keeps the original tag and the conversion build resolves its amd64 and
arm64 variants for the corresponding Unikraft targets. The source tag must publish
both `linux/amd64` and `linux/arm64` manifests. Override the variable with
`x86_64` or `arm64` when converting a single-platform source image.

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
