/**
 * Raksha API — HTTP Trigger: Upload Evidence
 *
 * POST /api/complaints/{complaintId}/evidence
 *
 * Accepts a multipart/form-data file upload from the tab frontend.
 * Validates the file, uploads to Azure Blob Storage, and links
 * the blob URL to the complaint's evidenceUrls array.
 *
 * Query params: tenantId, userId
 */

import { app, type HttpRequest, type HttpResponse, type InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { randomUUID } from "crypto";
import { complaints } from "../../shared/cosmosClient";
import { generateSasUrl } from "../../shared/blobHelpers";
import config from "../../shared/config";

/** MIME types we accept as evidence — must match blobService.ts in the bot */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
  "image/heif", "image/bmp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "message/rfc822", "application/vnd.ms-outlook",
  "text/plain",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

app.http("uploadEvidence", {
  methods: ["POST"],
  authLevel: "anonymous", // TODO: Add Entra ID token validation
  route: "complaints/{complaintId}/evidence",
  handler: async (req: HttpRequest, _context: InvocationContext): Promise<HttpResponse> => {
    const complaintId = req.params.complaintId;
    const tenantId = req.query.get("tenantId");
    const userId = req.query.get("userId");

    if (!complaintId || !tenantId || !userId) {
      return jsonResponse(400, { error: "complaintId, tenantId, and userId are required" });
    }

    // 1. Read the complaint and verify ownership
    let complaint;
    try {
      const { resource } = await complaints()
        .item(complaintId, tenantId)
        .read();

      if (!resource) {
        return jsonResponse(404, { error: "Complaint not found" });
      }

      if (resource.complainantId !== userId) {
        return jsonResponse(403, { error: "Access denied" });
      }

      complaint = resource;
    } catch (err) {
      return jsonResponse(500, { error: "Failed to read complaint", details: (err as Error).message });
    }

    // 2. Parse multipart form data
    let fileBuffer: Buffer;
    let fileName: string;
    let contentType: string;

    try {
      const formData = await req.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof Blob)) {
        return jsonResponse(400, { error: "No file provided. Send a 'file' field in multipart/form-data." });
      }

      fileName = (file as File).name || "unnamed";
      contentType = file.type || "application/octet-stream";

      // Validate MIME type
      const normalizedType = contentType.toLowerCase().split(";")[0].trim();
      if (!ALLOWED_MIME_TYPES.has(normalizedType)) {
        return jsonResponse(400, {
          error: `File type "${normalizedType}" is not allowed. Accepted: images, PDFs, Word, Excel, email, and text files.`,
        });
      }

      // Read file content
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);

      // Validate size
      if (fileBuffer.length > MAX_FILE_SIZE) {
        const sizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(1);
        return jsonResponse(400, { error: `File is ${sizeMB} MB — the limit is 25 MB.` });
      }
    } catch (err) {
      return jsonResponse(400, { error: "Failed to parse upload", details: (err as Error).message });
    }

    // 3. Upload to Blob Storage
    let blobUrl: string;
    try {
      const container = getContainerClient();
      await container.createIfNotExists({ access: undefined });

      const safeName = sanitizeFileName(fileName);
      const blobName = `${tenantId}/${complaintId}/${randomUUID()}-${safeName}`;
      const blockBlob = container.getBlockBlobClient(blobName);

      await blockBlob.uploadData(fileBuffer, {
        blobHTTPHeaders: { blobContentType: contentType },
        metadata: {
          complaintId,
          tenantId,
          originalFileName: safeName,
          uploadedBy: userId,
          uploadedAt: new Date().toISOString(),
        },
      });

      blobUrl = blockBlob.url;
    } catch (err) {
      return jsonResponse(500, { error: "Failed to upload file", details: (err as Error).message });
    }

    // 4. Link blob URL to complaint
    try {
      const existingUrls: string[] = complaint.evidenceUrls || [];
      const updatedUrls = [...existingUrls, blobUrl];

      await complaints().item(complaintId, tenantId).replace({
        ...complaint,
        evidenceUrls: updatedUrls,
        updatedAt: new Date().toISOString(),
      });

      return jsonResponse(200, {
        success: true,
        fileName: sanitizeFileName(fileName),
        blobUrl: generateSasUrl(blobUrl),
        totalCount: updatedUrls.length,
      });
    } catch (err) {
      return jsonResponse(500, { error: "File uploaded but failed to link to complaint", details: (err as Error).message });
    }
  },
});

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(status: number, body: unknown): HttpResponse {
  return new Response(
    JSON.stringify(body),
    { status, headers: { "Content-Type": "application/json" } },
  ) as unknown as HttpResponse;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 200);
}

let _containerClient: ReturnType<ReturnType<typeof BlobServiceClient.fromConnectionString>["getContainerClient"]> | undefined;

function getContainerClient() {
  if (_containerClient) return _containerClient;

  const connStr = config.storage.connectionString;
  const containerName = config.storage.evidenceContainer;

  if (!connStr) {
    const azuriteConnStr = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1";
    const client = BlobServiceClient.fromConnectionString(azuriteConnStr);
    _containerClient = client.getContainerClient(containerName);
    return _containerClient;
  }

  const client = BlobServiceClient.fromConnectionString(connStr);
  _containerClient = client.getContainerClient(containerName);
  return _containerClient;
}
