import { prisma } from "@workspace/db";
import { createTokenCipher } from "@/utils/crypto/token-cipher";

export const PLANE_ORIGIN = "https://api.plane.so";
export const PLANE_SCOPES = [
  "projects:read",
  "projects.features:read",
  "projects.members:read",
  "projects.states:read",
  "projects.intakes:read",
  "projects.intakes:write",
  "projects.work_items:read",
  "projects.work_items:write",
  "projects.work_items.comments:read",
  "projects.work_items.comments:write",
  "projects.work_items.attachments:read",
  "projects.work_items.attachments:write",
  "projects.work_item_types:read",
  "projects.work_item_properties:read",
  "projects.work_item_property_values:read",
  "projects.work_item_property_values:write",
  "workspaces.members:read",
].join(" ");
const cipher = () => createTokenCipher("PLANE_TOKEN_ENCRYPTION_KEY");
export const encryptPlaneToken = (value: string) => cipher().encrypt(value);
export const decryptPlaneToken = (value: string) => cipher().decrypt(value);
export const isPlaneEnabled = () => process.env.PLANE_ENABLED === "true";

export class PlaneApiError extends Error {
  constructor(public readonly status: number) {
    super(
      `Plane request failed (HTTP ${status}). Check integration permissions and configuration.`,
    );
  }
}

export class PlaneOAuthConfigurationError extends Error {
  constructor() {
    super("Plane OAuth client credentials are not configured.");
  }
}

export class PlaneTokenResponseError extends Error {
  constructor(public readonly reason: "json" | "access_token" | "expires_in") {
    super(`Invalid Plane token response: ${reason}.`);
  }
}

export async function requestBotToken(appInstallationId: string) {
  const id = process.env.PLANE_CLIENT_ID;
  const secret = process.env.PLANE_CLIENT_SECRET;
  if (!id || !secret) throw new PlaneOAuthConfigurationError();
  const response = await fetch(`${PLANE_ORIGIN}/auth/o/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      app_installation_id: appInstallationId,
      scope: PLANE_SCOPES,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new PlaneApiError(response.status);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PlaneTokenResponseError("json");
  }
  if (
    !data ||
    typeof data !== "object" ||
    !("access_token" in data) ||
    typeof data.access_token !== "string" ||
    !data.access_token.trim()
  ) {
    throw new PlaneTokenResponseError("access_token");
  }
  if (
    !("expires_in" in data) ||
    typeof data.expires_in !== "number" ||
    !Number.isFinite(data.expires_in) ||
    data.expires_in <= 0 ||
    !Number.isFinite(new Date(Date.now() + data.expires_in * 1000).getTime())
  ) {
    throw new PlaneTokenResponseError("expires_in");
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}

export class PlaneClient {
  readonly workspacePath: string;
  constructor(
    private token: string,
    workspaceSlug: string,
    private installationId?: string,
  ) {
    this.workspacePath = `/api/v1/workspaces/${encodeURIComponent(workspaceSlug)}`;
  }
  projectPath(id: string) {
    return `${this.workspacePath}/projects/${encodeURIComponent(id)}`;
  }
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    if (
      !path.startsWith("/api/v1/") &&
      !path.startsWith("/auth/o/app-installation/")
    )
      throw new Error("Invalid Plane API path.");
    const response = await fetch(`${PLANE_ORIGIN}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      if (response.status === 401 && this.installationId)
        await prisma.planeInstallation.update({
          where: { id: this.installationId },
          data: { healthState: "reconnect_required" },
        });
      throw new PlaneApiError(response.status);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
  async list<T>(path: string): Promise<T[]> {
    const output: T[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const separator = path.includes("?") ? "&" : "?";
      const page = await this.request<
        | T[]
        | { results: T[]; next_cursor?: string; next_page_results?: boolean }
      >(
        `${path}${separator}per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (Array.isArray(page)) return [...output, ...(page.flat() as T[])];
      if (!Array.isArray(page.results))
        throw new Error("Unsupported Plane list response.");
      output.push(...page.results);
      cursor = page.next_page_results ? page.next_cursor : undefined;
      if (cursor && seen.has(cursor))
        throw new Error("Plane returned a repeated pagination cursor.");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return output;
  }
}

export async function getPlaneClient(
  installationId: string,
): Promise<PlaneClient> {
  if (!isPlaneEnabled()) throw new Error("Plane integration is disabled.");
  const installation = await prisma.planeInstallation.findUniqueOrThrow({
    where: { id: installationId },
  });
  if (installation.healthState !== "connected")
    throw new Error("Reconnect the Plane integration.");
  let token = cipher().decrypt(installation.accessToken);
  if (installation.tokenExpiresAt.getTime() < Date.now() + 120_000) {
    try {
      const renewed = await requestBotToken(installation.appInstallationId);
      token = renewed.access_token;
      await prisma.planeInstallation.update({
        where: { id: installationId },
        data: {
          accessToken: cipher().encrypt(token),
          tokenExpiresAt: new Date(Date.now() + renewed.expires_in * 1000),
        },
      });
    } catch (error) {
      if (
        error instanceof PlaneApiError &&
        [400, 401, 403].includes(error.status)
      ) {
        await prisma.planeInstallation.update({
          where: { id: installationId },
          data: { healthState: "reconnect_required" },
        });
      }
      throw error;
    }
  }
  return new PlaneClient(token, installation.workspaceSlug, installationId);
}

export function planeRedirectUri() {
  const base = process.env.BETTER_AUTH_URL ?? process.env.BASE_URL;
  if (!base) throw new Error("Application base URL is missing.");
  return `${base.replace(/\/$/, "")}/api/plane/callback`;
}

export function escapePlaneHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
