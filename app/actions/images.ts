"use server";

import { execFile } from "child_process";
import { promisify } from "util";
import { revalidatePath } from "next/cache";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { getToken } from "./auth";
import {
  createJob,
  findActiveJob,
  listJobs,
} from "@/lib/image-conversion/jobs";
import {
  enqueueConversion,
  enqueueJob,
  recoverJobs,
} from "@/lib/image-conversion/worker";
import type { ConversionJob } from "@/lib/image-conversion/types";
import { fetchUnikraft, METROS } from "@/lib/unikraft/client";

const execFileAsync = promisify(execFile);
const UNIKRAFT_CLI = process.env.UNIKRAFT_CLI || "unikraft";
const TEMP_IMAGE_PATTERN =
  /(?:^|\/)(?:\d{10,}|docker-\d{10,}|converted-[^/:]+)(?::[^/]+)?$/;

export interface TemporaryImage {
  reference: string;
  metro: string;
  size: string;
  createdAt: string;
  digest: string;
  tags: string[];
}

function commandDetails(error: unknown, fallback: string) {
  const item = error as { message?: string; stderr?: string };
  return (
    [item.message, item.stderr].filter(Boolean).join("\n").trim() || fallback
  );
}

async function withLogin<T>(
  token: string,
  action: (configPath: string, env: NodeJS.ProcessEnv) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "unikraft-login-"));
  const tokenPath = path.join(dir, "token");
  const configPath = path.join(dir, "config");
  await fs.writeFile(tokenPath, token, { mode: 0o600 });
  const env = { ...process.env, KRAFTCLOUD_TOKEN: token };
  try {
    await execFileAsync(
      UNIKRAFT_CLI,
      ["--config", configPath, "login", "--no-browser", "--token", tokenPath],
      { env, timeout: 120000 },
    );
    return await action(configPath, env);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(normalizeRows);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const isImage = [
      "ref",
      "url",
      "repository",
      "name",
      "image",
      "reference",
    ].some((key) => typeof record[key] === "string");
    return (isImage ? [record] : []).concat(
      Object.values(record).flatMap(normalizeRows),
    );
  }
  return [];
}
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(strings);
  const result = text(value).trim();
  return result ? [result] : [];
}
function sizeInBytes(value: unknown): number {
  const match = text(value)
    .trim()
    .match(/^([0-9]+(?:\.[0-9]+)?)\s*(B|KiB|MiB|GiB|TiB)?$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = (match[2] || "B").toLowerCase();
  const exponent = { b: 0, kib: 1, mib: 2, gib: 3, tib: 4 }[unit] ?? 0;
  return amount * 1024 ** exponent;
}
function imageSize(row: Record<string, unknown>): string {
  const directSize = row.size_in_bytes || row.size_bytes || row.bytes;
  if (directSize !== undefined && directSize !== null)
    return text(directSize) || "-";
  const components = [row.initrd, row.kernel]
    .map((component) =>
      component && typeof component === "object"
        ? sizeInBytes((component as Record<string, unknown>).size)
        : 0,
    )
    .filter((size) => size > 0);
  if (components.length)
    return String(Math.round(components.reduce((total, size) => total + size, 0)));
  return text(row.size) || "-";
}
function isMetroIndexReference(reference: string) {
  return /^index\.[a-z0-9-]+\.unikraft\.cloud\//i.test(
    reference.replace(/^oci:\/\//, "").trim(),
  );
}
function preferredSize(current: string, candidate: string) {
  const currentBytes = Number(current);
  const candidateBytes = Number(candidate);
  if (Number.isFinite(candidateBytes) && candidateBytes > 0 && (!Number.isFinite(currentBytes) || currentBytes <= 0)) {
    return candidate;
  }
  return current !== '-' ? current : candidate;
}
function mergeImage(
  current: TemporaryImage | undefined,
  image: TemporaryImage,
): TemporaryImage {
  if (!current) return image;
  return {
    reference: current.reference,
    metro: current.metro !== "-" ? current.metro : image.metro,
    size: preferredSize(current.size, image.size),
    createdAt: current.createdAt !== "-" ? current.createdAt : image.createdAt,
    digest: current.digest || image.digest,
    tags: Array.from(new Set([...current.tags, ...image.tags])),
  };
}
function dedupeImages(images: TemporaryImage[]) {
  const merged = new Map<string, TemporaryImage>();
  for (const image of images)
    merged.set(image.reference, mergeImage(merged.get(image.reference), image));
  return [...merged.values()];
}
function normalize(
  row: Record<string, unknown>,
  metro: string,
): TemporaryImage | null {
  const rawReference = text(
    row.ref ||
      row.url ||
      row.repository ||
      row.name ||
      row.image ||
      row.reference,
  )
    .replace(/^oci:\/\//, "")
    .trim();
  if (!rawReference || isMetroIndexReference(rawReference)) return null;
  const [taggedReference, referenceDigest = ""] = rawReference.split("@", 2);
  const withoutRegistry = taggedReference.replace(/^unikraft\.io\//i, "");
  const slash = withoutRegistry.lastIndexOf("/");
  const colon = withoutRegistry.lastIndexOf(":");
  const reference =
    colon > slash ? withoutRegistry.slice(0, colon) : withoutRegistry;
  if (!TEMP_IMAGE_PATTERN.test(reference)) return null;
  const explicitTag = colon > slash ? withoutRegistry.slice(colon + 1) : "";
  const tags = strings(row.tags || row.tag || row.tag_name || row.tagName);
  if (explicitTag) tags.push(explicitTag);
  const digest =
    text(row.digest || row.content_digest || row.manifest_digest) ||
    referenceDigest;
  return {
    reference,
    metro,
    size: imageSize(row),
    createdAt:
      text(
        row.created_at ||
          row.createdAt ||
          row.created ||
          row.pushed_at ||
          row.pushedAt ||
          (row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>).created
            : ""),
      ) || "-",
    digest,
    tags: tags.length ? Array.from(new Set(tags)) : ["latest"],
  };
}
function parseTable(output: string, metro: string): TemporaryImage[] {
  return output
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.trim().match(/^([^\s]+)\s+(.+)$/);
      if (!match) return [];
      const image = normalize({ reference: match[1] }, metro);
      return image ? [image] : [];
    });
}

async function enrichImageSizes(
  images: TemporaryImage[],
  configPath: string,
  env: NodeJS.ProcessEnv,
): Promise<TemporaryImage[]> {
  const enriched = await Promise.all(
    images.map(async (image) => {
      const taggedReferences = image.tags.map(
        (tag) => `${image.reference}:${tag}`,
      );
      const lookupReferences = Array.from(
        new Set([
          ...taggedReferences.map((reference) => `unikraft.io/${reference}`),
          ...taggedReferences,
          image.reference,
        ]),
      );

      for (const lookupReference of lookupReferences) {
        try {
          const { stdout } = await execFileAsync(
            UNIKRAFT_CLI,
            [
              "--config",
              configPath,
              "image",
              "get",
              lookupReference,
              "--output",
              "json",
            ],
            { env, maxBuffer: 1024 * 1024, timeout: 120000 },
          );
          const details = dedupeImages(
            normalizeRows(JSON.parse(stdout))
              .map((row) => normalize(row, image.metro))
              .filter((item): item is TemporaryImage => item !== null),
          ).find((item) => item.reference === image.reference);
          if (details) return mergeImage(image, details);
        } catch (error) {
          if (!/references? not found/i.test(commandDetails(error, "")))
            return image;
        }
      }

      return null;
    }),
  );
  return enriched.filter((image): image is TemporaryImage => image !== null);
}

async function listImageDetailsFromApi(
  token: string,
): Promise<TemporaryImage[]> {
  const results = await Promise.allSettled(
    METROS.map(async (metro) => {
      const response = await fetchUnikraft<unknown>(
        "/v1/images",
        token,
        {},
        metro,
      );
      return normalizeRows(response)
        .map((row) => normalize(row, metro))
        .filter((image): image is TemporaryImage => image !== null);
    }),
  );

  return dedupeImages(
    results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
  );
}

async function mergeImageDetails(
  listed: TemporaryImage[],
  token: string,
  configPath: string,
  env: NodeJS.ProcessEnv,
) {
  const apiImages = await listImageDetailsFromApi(token);
  const merged = new Map(listed.map((image) => [image.reference, image]));
  for (const image of apiImages)
    merged.set(image.reference, mergeImage(merged.get(image.reference), image));
  return enrichImageSizes([...merged.values()], configPath, env);
}

export async function listTemporaryImages(options?: {
  includeSizes?: boolean;
}): Promise<{ images: TemporaryImage[]; error?: string }> {
  const token = await getToken();
  if (!token) return { images: [], error: "Unauthorized" };
  try {
    return await withLogin(token, async (configPath, env) => {
      const { stdout } = await execFileAsync(
        UNIKRAFT_CLI,
        ["--config", configPath, "image", "list", "--output", "json"],
        { env, maxBuffer: 5 * 1024 * 1024 },
      );
      try {
        const images = normalizeRows(JSON.parse(stdout))
          .map((row) => normalize(row, "-"))
          .filter((image): image is TemporaryImage => image !== null);
        const listed = dedupeImages(
          images.length ? images : parseTable(stdout, "-"),
        );
        if (options?.includeSizes === false) return { images: listed };
        return {
          images: await mergeImageDetails(listed, token, configPath, env),
        };
      } catch {
        const listed = dedupeImages(parseTable(stdout, "-"));
        if (options?.includeSizes === false) return { images: listed };
        return {
          images: await mergeImageDetails(listed, token, configPath, env),
        };
      }
    });
  } catch (error) {
    return {
      images: [],
      error: commandDetails(error, "Unable to list images."),
    };
  }
}

export async function deleteTemporaryImage(
  reference: string,
  _metro: string,
): Promise<{ success?: true; error?: string }> {
  void _metro;
  const token = await getToken();
  if (!token) return { error: "Unauthorized" };
  if (!TEMP_IMAGE_PATTERN.test(reference))
    return { error: "Only temporary images can be deleted." };
  try {
    await withLogin(token, (configPath, env) =>
      execFileAsync(
        UNIKRAFT_CLI,
        ["--config", configPath, "image", "delete", reference],
        { env, maxBuffer: 5 * 1024 * 1024, timeout: 120000 },
      ).then(() => undefined),
    );
    revalidatePath("/dashboard/images");
    return { success: true };
  } catch (error) {
    return { error: commandDetails(error, "Unable to delete image.") };
  }
}

export async function convertDockerImage(
  _previousState: {
    success?: true;
    error?: string;
    job?: ConversionJob;
  } | null,
  formData: FormData,
): Promise<{ success?: true; error?: string; job?: ConversionJob }> {
  const token = await getToken();
  if (!token) return { error: "Unauthorized" };
  const image = String(formData.get("image") || "").trim();
  if (
    !image ||
    /[\r\n]/.test(image) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(image)
  )
    return { error: "请输入有效的 Docker 镜像引用。" };
  await recoverJobs();
  if (await findActiveJob(image))
    return { error: "该镜像已有转换任务在队列中，请等待任务完成。" };
  const job = await createJob(image);
  enqueueConversion(job.id, token, image);
  revalidatePath("/dashboard/images");
  return { success: true, job };
}

export async function listConversionJobs(): Promise<{
  jobs: ConversionJob[];
  error?: string;
}> {
  if (!(await getToken())) return { jobs: [], error: "Unauthorized" };
  try {
    return { jobs: await listJobs() };
  } catch (error) {
    return { jobs: [], error: commandDetails(error, "无法读取转换任务。") };
  }
}

export async function retryConversionJob(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Unauthorized" };
  const job = (await listJobs()).find((item) => item.id === id);
  if (!job || job.status !== "failed")
    return { error: "只能重试失败的转换任务。" };
  const replacement = await createJob(job.sourceImage);
  enqueueJob(replacement.id, token, replacement.sourceImage);
  revalidatePath("/dashboard/images");
  return { success: true };
}
