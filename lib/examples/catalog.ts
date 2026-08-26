export type ExampleTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  directory: string;
  port: string;
  memoryMb: number;
  sourceUrl: string;
};

// Keep this allow-list explicit. Do not accept arbitrary repositories or paths from a form.
export const EXAMPLES_COMMIT = 'b8fc9815b2e82075531dfc807dfbd50250a5e625';
export const EXAMPLES_REPOSITORY = 'https://github.com/unikraft-cloud/examples.git';

const EXAMPLE_DIRECTORIES = [
  'basic-ops', 'build-environments', 'build-environments/rom1', 'build-environments/rom2', 'caddy2.7-go1.21', 'chromium-cdp', 'chromium-cdp-auth', 'debian-ssh', 'dragonflydb', 'duckdb-go1.21', 'feature-change-instance-cmd', 'github-webhook-node', 'grafana', 'haproxy', 'httpserver-boost1.74-gpp13.2', 'httpserver-bun', 'httpserver-c-debug', 'httpserver-dotnet10.0', 'httpserver-elixir1.16', 'httpserver-erlang26.2', 'httpserver-expressjs4.18-node21', 'httpserver-flask-redis/flask', 'httpserver-flask-redis/redis', 'httpserver-gcc13.2', 'httpserver-go1.21', 'httpserver-go1.22-redis/httpserver-go', 'httpserver-go1.22-redis/redis', 'httpserver-gpp13.2', 'httpserver-java17-springboot', 'httpserver-java17-spring-petclinic', 'httpserver-java21', 'httpserver-lua5.1', 'httpserver-nginx-vite-vanilla', 'httpserver-node21-nextjs', 'httpserver-node21-solid-start', 'httpserver-node22-react-router', 'httpserver-node22-sveltekit', 'httpserver-node26', 'httpserver-node-express-puppeteer', 'httpserver-node-vite-ssr-vanilla', 'httpserver-node-vite-vanilla', 'httpserver-perl5.42', 'httpserver-php8.2', 'httpserver-prisma-expressjs4.19-node18', 'httpserver-python3.12', 'httpserver-python3.12-django5.0', 'httpserver-python3.12-fastapi-0.121.3', 'httpserver-python3.12-flask3.0', 'httpserver-python3.12-flask3.0-sqlite', 'httpserver-ruby3.2', 'httpserver-rust1.75-tokio', 'httpserver-rust1.88-actix-web4', 'httpserver-rust1.88-rocket0.5', 'httpserver-rust1.91', 'httpserver-rust-trunkrs-leptos', 'hugo0.122', 'imaginary', 'mariadb', 'mcp-server-arxiv', 'mcp-server-simple', 'memcached1.6', 'minecraft', 'minio', 'mongodb', 'mysql', 'neo4j', 'nginx', 'nginx-flask-mongo/flask', 'nginx-flask-mongo/mongo', 'nginx-flask-mongo/nginx', 'node18-agario', 'node18-wingsio', 'node21-websocket', 'node24-karaoke', 'node-code-execution', 'node-code-execution/rom1', 'node-code-execution/rom2', 'node-playwright-chromium', 'node-playwright-firefox', 'node-playwright-webkit', 'novnc-browser', 'openclaw', 'opentelemetry-collector', 'phoenix-postgres/phoenix', 'phoenix-postgres/postgres', 'postgres', 'prometheus-grafana/grafana', 'prometheus-grafana/prometheus', 'python-playwright-chromium', 'redis7.2', 'ruby3.2-rails', 'skipper0.18', 'spin-wagi-http', 'traefik', 'tyk/redis', 'tyk/tyk', 'visual-studio-code-server', 'vsftpd', 'wazero-import-go', 'wordpress/mariadb', 'wordpress/wordpress', 'wordpress-all-in-one',
] as const;

function category(directory: string) {
  if (/playwright|chromium|novnc|visual-studio|minecraft|agario|wingsio|karaoke/.test(directory)) return '应用与浏览器';
  if (/postgres|redis|maria|mongo|mysql|neo4j|dragonfly|memcached|grafana|prometheus|tyk/.test(directory)) return '数据与基础设施';
  if (/httpserver|flask|caddy|nginx|haproxy|traefik|php|ruby|java|rust|go|node|bun|elixir|erlang|perl|lua|hugo|phoenix|spin|wazero|dotnet/.test(directory)) return 'Web 与语言';
  return '平台与工具';
}

export const EXAMPLE_TEMPLATES: ExampleTemplate[] = EXAMPLE_DIRECTORIES.map((directory) => ({
  id: directory.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(),
  name: directory.split('/').pop() || directory,
  description: `官方 examples：${directory}`,
  directory,
  category: category(directory),
  port: '443:8080/http+tls',
  memoryMb: 512,
  sourceUrl: `${EXAMPLES_REPOSITORY.replace(/\.git$/, '')}/tree/${EXAMPLES_COMMIT}/${directory}`,
}));

export function getExampleTemplate(id: string) { return EXAMPLE_TEMPLATES.find((item) => item.id === id); }