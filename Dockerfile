FROM node:20-bullseye

RUN apt-get update && apt-get install -y curl ca-certificates docker.io git && \
    rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -fsSL https://unikraft.com/cli/install.sh | sh

ENV PATH="/root/.local/bin:${PATH}"
ENV UNIKRAFT_CLI=unikraft
ENV UNIKRAFT_DATA_DIR=/app/data
WORKDIR /app

ARG DEPLOYMENT_VERSION
ENV DEPLOYMENT_VERSION=${DEPLOYMENT_VERSION}

COPY package.json package-lock.json ./
RUN npm install

COPY . .
# The key is injected only while building the image and is embedded by Next.js in
# the Server Action references. Local builds can omit the secret and use Next's
# generated key; production replicas must use the same CI secret.
RUN --mount=type=secret,id=next_server_actions_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,required=false \
    npm run build

EXPOSE 3000
CMD ["npm", "start"]
