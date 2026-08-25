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
    curl -sSfL "https://github.com/unikraft/kraftkit/releases/download/v${KRAFTKIT_VERSION}/unikraft_${KRAFTKIT_VERSION}_linux_${KRAFT_ARCH}.tar.gz" -o unikraft.tar.gz && \
    tar -xzf unikraft.tar.gz && \
    mv unikraft /usr/local/bin/ && \
    rm unikraft.tar.gz

ENV PATH="/root/.local/bin:${PATH}"
ENV UNIKRAFT_CLI=unikraft
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
