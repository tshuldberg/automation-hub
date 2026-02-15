import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import {
  ApprovalPolicy,
  ApprovalPolicySchema,
  JobSpec,
  JobSpecSchema,
  RuntimeConfig,
  RuntimeConfigSchema,
} from "../contracts.js";

async function parseYamlFile(filePath: string): Promise<unknown> {
  const contents = await fs.readFile(filePath, "utf8");
  return YAML.parse(contents);
}

export async function loadRuntimeConfig(repoRoot: string): Promise<{ config: RuntimeConfig; sourcePath: string }> {
  const runtimePath = path.join(repoRoot, "config", "runtime.yaml");
  const fallbackPath = path.join(repoRoot, "config", "runtime.example.yaml");
  const sourcePath = (await fileExists(runtimePath)) ? runtimePath : fallbackPath;
  const parsed = await parseYamlFile(sourcePath);
  return {
    config: RuntimeConfigSchema.parse(parsed),
    sourcePath,
  };
}

export async function loadJobSpec(repoRoot: string, relativeJobFile: string): Promise<JobSpec> {
  const jobPath = path.join(repoRoot, relativeJobFile);
  const parsed = await parseYamlFile(jobPath);
  return JobSpecSchema.parse(parsed);
}

export async function loadApprovalPolicy(repoRoot: string, relativePolicyFile: string): Promise<ApprovalPolicy> {
  const policyPath = path.join(repoRoot, relativePolicyFile);
  const parsed = await parseYamlFile(policyPath);
  return ApprovalPolicySchema.parse(parsed);
}

export async function loadJsonFile<T>(filePath: string): Promise<T> {
  const contents = await fs.readFile(filePath, "utf8");
  return JSON.parse(contents) as T;
}

export async function saveJsonFile(filePath: string, payload: unknown): Promise<void> {
  const contents = JSON.stringify(payload, null, 2);
  await fs.writeFile(filePath, `${contents}\n`, "utf8");
}

export async function saveTextFile(filePath: string, text: string): Promise<void> {
  await fs.writeFile(filePath, text, "utf8");
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
