import type { ArtifactRef } from '@geotrack/core';

// Real implementation (Supabase Storage) is wired once Supabase is connected
// (see docs/specs/debt.md) — this interface lets report-pdf.ts be tested with
// a fake today and swapped for a real client later without touching the step.
export type StorageClient = {
  upload(input: {
    bucket: string;
    key: string;
    data: Buffer;
    mimeType: string;
  }): Promise<ArtifactRef>;
};
