FROM node:20-bullseye

RUN apt-get update && apt-get install -y curl ca-certificates docker.io && \
    rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
ARG KRAFTKIT_VERSION=0.12.15
RUN case "${TARGETARCH}" in \
      amd64) KRAFT_ARCH=amd64 ;; \
      arm64) KRAFT_ARCH=arm64 ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    curl -sSfL "https://github.com/unikraft/kraftkit/releases/download/v${KRAFTKIT_VERSION}/kraft_${KRAFTKIT_VERSION}_linux_${KRAFT_ARCH}.tar.gz" -o kraft.tar.gz && \
    tar -xzf kraft.tar.gz && \
    mv kraft /usr/local/bin/ && \
    rm kraft.tar.gz

ENV PATH="/root/.local/bin:${PATH}"
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
