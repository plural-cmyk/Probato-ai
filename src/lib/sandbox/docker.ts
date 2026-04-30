import Dockerode from "dockerode";

// Docker connection — supports local socket or remote TCP host
function getDocker(): Dockerode {
  const host = process.env.DOCKER_HOST;

  if (host) {
    // Remote Docker host (e.g., tcp://203.0.113.50:2376)
    const url = new URL(host);
    return new Dockerode({
      host: url.hostname,
      port: parseInt(url.port || "2376"),
      protocol: url.protocol.replace(":", "") as "http" | "https",
      ca: process.env.DOCKER_CA,
      cert: process.env.DOCKER_CERT,
      key: process.env.DOCKER_KEY,
    });
  }

  // Local Docker via Unix socket
  return new Dockerode({ socketPath: "/var/run/docker.sock" });
}

// Lazy singleton
let dockerInstance: Dockerode | null = null;
export function getDockerClient(): Dockerode {
  if (!dockerInstance) {
    dockerInstance = getDocker();
  }
  return dockerInstance;
}

// Check if Docker is available
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const docker = getDockerClient();
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

export interface SandboxConfig {
  repoUrl: string;
  repoName: string;
  branch?: string;
  sandboxId: string; // Our internal ID (project ID)
}

export interface SandboxInfo {
  containerId: string;
  name: string;
  status: "creating" | "running" | "stopped" | "error";
  port?: number;
  url?: string;
  createdAt: string;
}

const SANDBOX_NETWORK = "probato-sandbox";

// Ensure the sandbox network exists
async function ensureNetwork(docker: Dockerode): Promise<void> {
  try {
    const networks = await docker.listNetworks({
      filters: JSON.stringify({ name: [SANDBOX_NETWORK] }),
    });
    if (networks.length === 0) {
      await docker.createNetwork({
        Name: SANDBOX_NETWORK,
        Driver: "bridge",
        Labels: { managed: "probato" },
      });
    }
  } catch (error) {
    console.error("Failed to ensure network:", error);
  }
}

// Generate a unique port assignment
function generatePort(): number {
  // Range 10000-65535, avoid well-known ports
  return 10000 + Math.floor(Math.random() * 55535);
}

/**
 * Create and start a sandbox container for a given repo.
 *
 * The container will:
 * 1. Start from a node:20-slim base image
 * 2. Clone the repo
 * 3. Detect the framework (Next.js, React, Vite, etc.)
 * 4. Install dependencies
 * 5. Start the app
 */
export async function createSandbox(
  config: SandboxConfig
): Promise<SandboxInfo> {
  const docker = getDockerClient();
  await ensureNetwork(docker);

  const port = generatePort();
  const containerName = `probato-${config.sandboxId}`;

  // Remove existing container with same name if any
  try {
    const existing = docker.getContainer(containerName);
    await existing.remove({ force: true });
  } catch {
    // Container doesn't exist, that's fine
  }

  // Pull node:20-slim image if not available
  try {
    await docker.getImage("node:20-slim").inspect();
  } catch {
    console.log("Pulling node:20-slim image...");
    await new Promise<void>((resolve, reject) => {
      docker.pull("node:20-slim", (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (followErr: Error | null) => {
          if (followErr) return reject(followErr);
          resolve();
        });
      });
    });
  }

  // Create and start the container
  const container = await docker.createContainer({
    name: containerName,
    Image: "node:20-slim",
    Tty: true,
    OpenStdin: true,
    Env: [
      "NODE_ENV=development",
      `PORT=${port}`,
    ],
    Labels: {
      managed: "probato",
      "probato.project-id": config.sandboxId,
      "probato.repo-url": config.repoUrl,
      "probato.repo-name": config.repoName,
    },
    HostConfig: {
      PortBindings: {
        [`${port}/tcp`]: [{ HostPort: port.toString() }],
      },
      Memory: 512 * 1024 * 1024, // 512MB limit
      MemorySwap: 1024 * 1024 * 1024, // 1GB with swap
      CpuShares: 512,
      NetworkMode: SANDBOX_NETWORK,
      AutoRemove: false,
    },
    ExposedPorts: {
      [`${port}/tcp`]: {},
    },
    Cmd: ["/bin/bash", "-c", buildEntrypoint(config, port)],
  });

  await container.start();

  return {
    containerId: container.id,
    name: containerName,
    status: "running",
    port,
    url: `http://localhost:${port}`,
    createdAt: new Date().toISOString(),
  };
}

// Build the shell script that runs inside the container
function buildEntrypoint(config: SandboxConfig, port: number): string {
  const branchArg = config.branch ? `--branch ${config.branch}` : "";

  return `
set -e

echo "=== Probato Sandbox Starting ==="
echo "Repo: ${config.repoUrl}"
echo "Branch: ${config.branch || 'default'}"

# Install git
apt-get update -qq && apt-get install -y -qq git > /dev/null 2>&1

# Clone the repository
echo "Cloning repository..."
cd /home
git clone ${branchArg} ${config.repoUrl} app 2>&1
cd app

# Detect framework and install dependencies
echo "Installing dependencies..."
if [ -f "package.json" ]; then
  npm install --legacy-peer-deps 2>&1 || true

  # Detect and start the app
  echo "Detecting framework..."

  if grep -q '"next"' package.json 2>/dev/null; then
    echo "Detected Next.js application"
    export PORT=${port}
    npx next dev -p ${port} --hostname 0.0.0.0 &
  elif grep -q '"vite"' package.json 2>/dev/null; then
    echo "Detected Vite application"
    npx vite --host 0.0.0.0 --port ${port} &
  elif grep -q '"react-scripts"' package.json 2>/dev/null; then
    echo "Detected Create React App"
    PORT=${port} npx react-scripts start &
  else
    echo "Detected generic Node.js application"
    # Try the start script
    if grep -q '"start"' package.json 2>/dev/null; then
      PORT=${port} npm start &
    else
      echo "No start script found. Starting a simple HTTP server on port ${port}"
      npx -y serve -s -l ${port} . &
    fi
  fi
else
  echo "No package.json found. Starting static file server."
  npx -y serve -s -l ${port} . &
fi

echo "=== Sandbox Ready on port ${port} ==="

# Keep container alive
wait
`.trim();
}

/**
 * Get the status of a sandbox container
 */
export async function getSandboxStatus(
  containerId: string
): Promise<SandboxInfo | null> {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);
    const info = await container.inspect();

    const labels = info.Config.Labels || {};
    const portMapping = info.NetworkSettings.Ports;
    let port: number | undefined;
    let url: string | undefined;

    // Extract the port from the container's port bindings
    if (portMapping) {
      for (const [containerPort, bindings] of Object.entries(portMapping)) {
        if (bindings && bindings.length > 0) {
          port = parseInt(bindings[0].HostPort);
          url = `http://localhost:${port}`;
          break;
        }
      }
    }

    return {
      containerId: containerId,
      name: info.Name.replace(/^\//, ""),
      status: info.State.Running ? "running" : "stopped",
      port,
      url,
      createdAt: info.Created,
    };
  } catch {
    return null;
  }
}

/**
 * Stop and remove a sandbox container
 */
export async function destroySandbox(containerId: string): Promise<boolean> {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);

    try {
      await container.stop();
    } catch {
      // Already stopped
    }

    await container.remove({ force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get logs from a sandbox container
 */
export async function getSandboxLogs(
  containerId: string,
  tail: number = 100
): Promise<string> {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    });
    return logs.toString("utf-8");
  } catch (error) {
    return `Error fetching logs: ${error}`;
  }
}
