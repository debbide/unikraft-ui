FROM node:20-bullseye

RUN apt-get update && apt-get install -y curl ca-certificates docker.io && \
    rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -fsSL https://unikraft.com/cli/install.sh | sh

ENV PATH="/root/.local/bin:${PATH}"
ENV UNIKRAFT_CLI=unikraft
ENV UNIKRAFT_DATA_DIR=/app/data
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
