export type ExampleTemplate = {
  id: string;
  name: string;
  description: string;
  directory: string;
  port: string;
  memoryMb: number;
  sourceUrl: string;
};

// Keep this allow-list explicit. Do not accept arbitrary repositories or paths from a form.
export const EXAMPLES_COMMIT = 'b8fc9815b2e82075531dfc807dfbd50250a5e625';
export const EXAMPLES_REPOSITORY = 'https://github.com/unikraft-cloud/examples.git';

export const EXAMPLE_TEMPLATES: ExampleTemplate[] = [
  { id: 'node21-websocket', name: 'Node.js WebSocket', description: '官方 Node.js WebSocket 回显服务。', directory: 'node21-websocket', port: '443:8080/http+tls', memoryMb: 1024, sourceUrl: 'https://github.com/unikraft-cloud/examples/tree/b8fc9815b2e82075531dfc807dfbd50250a5e625/node21-websocket' },
  { id: 'node21-express', name: 'Node.js Express', description: '官方 Express HTTP 示例。', directory: 'httpserver-expressjs4.18-node21', port: '443:3000/http+tls', memoryMb: 512, sourceUrl: 'https://github.com/unikraft-cloud/examples/tree/b8fc9815b2e82075531dfc807dfbd50250a5e625/httpserver-expressjs4.18-node21' },
  { id: 'go-http', name: 'Go HTTP Server', description: '官方 Go HTTP 示例。', directory: 'httpserver-go1.21', port: '443:8080/http+tls', memoryMb: 256, sourceUrl: 'https://github.com/unikraft-cloud/examples/tree/b8fc9815b2e82075531dfc807dfbd50250a5e625/httpserver-go1.21' },
  { id: 'fastapi', name: 'Python FastAPI', description: '官方 FastAPI 示例。', directory: 'httpserver-python3.12-fastapi-0.121.3', port: '443:8080/http+tls', memoryMb: 512, sourceUrl: 'https://github.com/unikraft-cloud/examples/tree/b8fc9815b2e82075531dfc807dfbd50250a5e625/httpserver-python3.12-fastapi-0.121.3' },
  { id: 'nginx-vite', name: 'Nginx + Vite', description: '官方 Nginx 静态站点示例。', directory: 'httpserver-nginx-vite-vanilla', port: '443:8080/http+tls', memoryMb: 256, sourceUrl: 'https://github.com/unikraft-cloud/examples/tree/b8fc9815b2e82075531dfc807dfbd50250a5e625/httpserver-nginx-vite-vanilla' },
];

export function getExampleTemplate(id: string) { return EXAMPLE_TEMPLATES.find((item) => item.id === id); }