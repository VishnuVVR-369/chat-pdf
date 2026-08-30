import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CORPUS_DIR, storageSha256ToHex, validateCorpus } from "./config";
import { convexRun } from "./convex-cli";

type RemoteCorpusDocument = {
  _id: string;
  originalFilename: string;
  sha256: string;
  status: "uploading" | "uploaded" | "processing" | "ready" | "failed";
  pageCount?: number;
  processingError?: string;
};

async function listRemoteDocuments(push = false) {
  return await convexRun<RemoteCorpusDocument[]>(
    "evaluationData:listCorpusDocuments",
    {},
    { push },
  );
}

export async function seedCorpus() {
  const manifest = await validateCorpus();
  let remote = await listRemoteDocuments(true);

  for (const document of manifest.documents) {
    const existing = remote.find(
      (candidate) => candidate.originalFilename === document.filename,
    );
    if (existing) {
      if (
        existing.sha256 &&
        storageSha256ToHex(existing.sha256) !== document.sha256
      ) {
        throw new Error(
          `Convex already has ${document.filename} with a different checksum. ` +
            "Delete that evaluation document explicitly before reseeding.",
        );
      }
      console.log(`reuse ${document.filename} (${existing.status})`);
      continue;
    }

    console.log(`upload ${document.filename}`);
    const target = await convexRun<{
      documentId: string;
      uploadUrl: string;
      method: "POST";
    }>(
      "documentUploadTargets:createDirectUploadTarget",
      { filename: document.filename, contentType: "application/pdf" },
      { identity: true },
    );
    const bytes = await readFile(
      path.join(CORPUS_DIR, "documents", document.filename),
    );
    const uploadResponse = await fetch(target.uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: new Blob([bytes], { type: "application/pdf" }),
    });
    if (!uploadResponse.ok) {
      throw new Error(
        `Convex storage upload failed for ${document.filename}: ` +
          `${uploadResponse.status} ${await uploadResponse.text()}`,
      );
    }
    const upload = (await uploadResponse.json()) as { storageId?: string };
    if (!upload.storageId) {
      throw new Error(
        `Convex did not return a storage ID for ${document.filename}`,
      );
    }
    await convexRun(
      "documentUploads:completeDirectUpload",
      { documentId: target.documentId, storageId: upload.storageId },
      { identity: true },
    );
    remote = await listRemoteDocuments();
  }

  const deadline = Date.now() + 30 * 60 * 1_000;
  while (Date.now() < deadline) {
    remote = await listRemoteDocuments();
    const corpusRows = manifest.documents.map((document) => ({
      manifest: document,
      remote: remote.find(
        (candidate) => candidate.originalFilename === document.filename,
      ),
    }));
    const failed = corpusRows.find(
      (entry) => entry.remote?.status === "failed",
    );
    if (failed) {
      throw new Error(
        `${failed.manifest.filename} failed processing: ` +
          `${failed.remote?.processingError ?? "unknown error"}`,
      );
    }
    if (corpusRows.every((entry) => entry.remote?.status === "ready")) {
      for (const entry of corpusRows) {
        if (
          !entry.remote?.sha256 ||
          storageSha256ToHex(entry.remote.sha256) !== entry.manifest.sha256
        ) {
          throw new Error(
            `Convex checksum mismatch for ${entry.manifest.filename}`,
          );
        }
        if (entry.remote.pageCount !== entry.manifest.pageCount) {
          throw new Error(
            `Convex page count mismatch for ${entry.manifest.filename}`,
          );
        }
      }
      console.log("All evaluation corpus documents are ready.");
      return;
    }

    console.log(
      corpusRows
        .map(
          (entry) =>
            `${entry.manifest.key}=${entry.remote?.status ?? "missing"}`,
        )
        .join(" "),
    );
    await delay(10_000);
  }

  throw new Error("Timed out waiting for the evaluation corpus to process");
}
