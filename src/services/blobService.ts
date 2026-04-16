/**
 * Raksha — Blob Storage Service
 *
 * Handles evidence file uploads to Azure Blob Storage.
 * Evidence is stored in the "evidence-files" container, partitioned
 * by complaint ID: {complaintId}/{uuid}-{originalFilename}
 *
 * SAS URLs are generated on-demand for secure, time-limited access.
 */

import {
  BlobServiceClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { randomUUID } from "crypto";
import config from "../config";

// ============================================================================
// Allowed file types
// ============================================================================

/** MIME types we accept as evidence. Anything else is rejected. */
const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/bmp",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Spreadsheets (sometimes evidence is in Excel)
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Email
  "message/rfc822",        // .eml
  "application/vnd.ms-outlook", // .msg
  // Plain text
  "text/plain",
]);

/** Max file size: 25 MB (Teams limit is 25 MB for bot attachments) */
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** SAS URL validity: 1 hour */
const SAS_EXPIRY_MINUTES = 60;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  /** Friendly file type label for the card */
  typeLabel?: string;
  /** File size in human-readable format */
  sizeLabel?: string;
}

export interface UploadResult {
  blobUrl: string;
  blobName: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

// ============================================================================
// File validation
// ============================================================================

/**
 * Validate a file before showing the evidence confirmation card.
 * Checks MIME type and file size.
 */
export function validateFile(
  contentType: string,
  sizeBytes: number | undefined,
  fileName: string,
): FileValidationResult {
  const normalizedType = contentType.toLowerCase().split(";")[0].trim();

  if (!ALLOWED_MIME_TYPES.has(normalizedType)) {
    return {
      valid: false,
      error: `"${fileName}" is a ${normalizedType} file. I can only save images, PDFs, documents, and emails as evidence.`,
    };
  }

  if (sizeBytes !== undefined && sizeBytes > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `"${fileName}" is ${sizeMB} MB — the limit is 25 MB. Can you share a smaller version?`,
    };
  }

  return {
    valid: true,
    typeLabel: getTypeLabel(normalizedType),
    sizeLabel: sizeBytes ? formatSize(sizeBytes) : "Unknown size",
  };
}

// ============================================================================
// Upload
// ============================================================================

/**
 * Download a file from a URL (e.g. Teams attachment download URL) and
 * upload it to Azure Blob Storage.
 *
 * SECURITY: The downloadUrl is validated to be a Microsoft domain to
 * prevent SSRF attacks via tampered card action data.
 */
export async function uploadEvidence(
  complaintId: string,
  tenantId: string,
  fileName: string,
  contentType: string,
  downloadUrl: string,
): Promise<UploadResult> {
  // 0. SSRF protection — only allow Microsoft/Teams download URLs
  validateDownloadUrl(downloadUrl);

  // 1. Download from source URL
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 2. Validate size after download (Teams doesn't always provide size upfront)
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds 25 MB limit (${formatSize(buffer.length)})`);
  }

  // 3. Upload to Blob Storage
  const container = getContainerClient();
  const safeName = sanitizeFileName(fileName);
  const blobName = `${tenantId}/${complaintId}/${randomUUID()}-${safeName}`;

  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType },
    metadata: {
      complaintId,
      tenantId,
      originalFileName: safeName,
      uploadedAt: new Date().toISOString(),
    },
  });

  return {
    blobUrl: blockBlob.url,
    blobName,
    fileName: safeName,
    contentType,
    sizeBytes: buffer.length,
  };
}

// ============================================================================
// SAS URL generation
// ============================================================================

/**
 * Generate a time-limited SAS URL for reading a blob.
 * Used when ICC or employee needs to view evidence.
 */
export function generateSasUrl(blobUrl: string): string {
  const connStr = config.storage.connectionString;
  if (!connStr) {
    // Local dev / Azurite — return the raw URL
    return blobUrl;
  }

  // Parse account name and key from connection string
  const accountName = extractFromConnStr(connStr, "AccountName");
  const accountKey = extractFromConnStr(connStr, "AccountKey");

  if (!accountName || !accountKey) {
    console.warn("[evidence] Cannot generate SAS — missing account credentials, returning raw URL");
    return blobUrl;
  }

  const credential = new StorageSharedKeyCredential(accountName, accountKey);

  // Extract container and blob name from the full URL
  const url = new URL(blobUrl);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const containerName = pathParts[0];
  const blobName = pathParts.slice(1).join("/");

  const expiresOn = new Date();
  expiresOn.setMinutes(expiresOn.getMinutes() + SAS_EXPIRY_MINUTES);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("r"), // Read only
      expiresOn,
    },
    credential,
  ).toString();

  return `${blobUrl}?${sasToken}`;
}

// ============================================================================
// Internals
// ============================================================================

let _containerClient: ContainerClient | undefined;

function getContainerClient(): ContainerClient {
  if (_containerClient) return _containerClient;

  const connStr = config.storage.connectionString;
  const containerName = config.storage.evidenceContainer;

  if (!connStr) {
    // Azurite default for local dev
    const azuriteConnStr = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1";
    const client = BlobServiceClient.fromConnectionString(azuriteConnStr);
    _containerClient = client.getContainerClient(containerName);
    return _containerClient;
  }

  const client = BlobServiceClient.fromConnectionString(connStr);
  _containerClient = client.getContainerClient(containerName);
  return _containerClient;
}

/** Ensure the evidence container exists (call once at startup or first upload) */
export async function ensureContainerExists(): Promise<void> {
  const container = getContainerClient();
  await container.createIfNotExists({ access: undefined }); // Private access
}

function sanitizeFileName(name: string): string {
  // Remove path traversal attempts and limit to safe characters
  return name
    .replace(/[/\\]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 200);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTypeLabel(mimeType: string): string {
  if (mimeType.startsWith("image/")) return `Image (${mimeType.split("/")[1].toUpperCase()})`;
  if (mimeType === "application/pdf") return "PDF Document";
  if (mimeType.includes("word")) return "Word Document";
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "Spreadsheet";
  if (mimeType === "message/rfc822") return "Email (.eml)";
  if (mimeType === "application/vnd.ms-outlook") return "Email (.msg)";
  if (mimeType === "text/plain") return "Text File";
  return mimeType;
}

function extractFromConnStr(connStr: string, key: string): string | undefined {
  const match = connStr.match(new RegExp(`${key}=([^;]+)`));
  return match?.[1];
}

/**
 * SSRF protection: ensure download URL is a trusted Microsoft domain.
 * Teams file download URLs come from *.sharepoint.com, *.microsoft.com,
 * or the Bot Framework's attachment service.
 */
const ALLOWED_DOWNLOAD_HOSTS = [
  /\.sharepoint\.com$/,
  /\.microsoft\.com$/,
  /\.microsoftonline\.com$/,
  /\.botframework\.com$/,
  /\.skype\.com$/,
  /\.teams\.microsoft\.com$/,
  // Local dev: Azurite / localhost
  /^localhost$/,
  /^127\.0\.0\.1$/,
];

function validateDownloadUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid download URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Download URL must use HTTPS or HTTP");
  }

  const hostname = parsed.hostname.toLowerCase();
  const isTrusted = ALLOWED_DOWNLOAD_HOSTS.some((pattern) => pattern.test(hostname));
  if (!isTrusted) {
    throw new Error(`Download URL host not allowed: ${hostname}`);
  }
}
