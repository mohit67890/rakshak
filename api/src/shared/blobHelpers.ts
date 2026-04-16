/**
 * Raksha API — Blob Storage Helpers
 *
 * Generates time-limited SAS URLs for evidence files stored in Azure Blob Storage.
 * Used by HTTP triggers to return viewable URLs to the tab frontend.
 */

import {
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import config from "./config";

const SAS_EXPIRY_MINUTES = 60;

/**
 * Generate a read-only SAS URL for a blob.
 * Falls back to the raw URL if credentials are unavailable (local dev).
 */
export function generateSasUrl(blobUrl: string): string {
  const connStr = config.storage.connectionString;
  if (!connStr) return blobUrl;

  const accountName = extractFromConnStr(connStr, "AccountName");
  const accountKey = extractFromConnStr(connStr, "AccountKey");

  if (!accountName || !accountKey) return blobUrl;

  const credential = new StorageSharedKeyCredential(accountName, accountKey);

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
      permissions: BlobSASPermissions.parse("r"),
      expiresOn,
    },
    credential,
  ).toString();

  return `${blobUrl}?${sasToken}`;
}

/**
 * Transform evidence URLs in a complaint to time-limited SAS URLs.
 */
export function addSasToEvidenceUrls<T extends { evidenceUrls?: string[] }>(complaint: T): T {
  if (!complaint.evidenceUrls?.length) return complaint;

  return {
    ...complaint,
    evidenceUrls: complaint.evidenceUrls.map(generateSasUrl),
  };
}

function extractFromConnStr(connStr: string, key: string): string | undefined {
  const match = connStr.match(new RegExp(`${key}=([^;]+)`));
  return match?.[1];
}
