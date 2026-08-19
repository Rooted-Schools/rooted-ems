/**
 * Coverage tests for the stable error-code -> translation-key maps.
 *
 * uploadFile() and createDocumentRecord() return stable codes (never raw
 * provider text). The client maps each code to a bilingual message via these
 * two Records. A code with no mapping would surface as a raw code to a family,
 * so these tests assert every known code maps to a translation key that
 * actually resolves in both English and Spanish, and that the maps carry no
 * stray keys.
 */
import { describe, it, expect, vi } from "vitest";

// upload.ts imports the browser Supabase client at module load; stub it so the
// module can be imported in the test environment. Only the exported pure maps
// are exercised here.
vi.mock("@rooted-ems/database", () => ({
  createBrowserClient: () => ({ storage: { from: () => ({}) } }),
}));

import {
  UPLOAD_ERROR_TRANSLATION_KEY,
  DOCUMENT_RECORD_ERROR_TRANSLATION_KEY,
  type UploadErrorCode,
} from "@/lib/storage/upload";
import type { DocumentRecordErrorCode } from "@/lib/mutations/documents";
import { tx, type TranslationKey } from "@/lib/i18n/translations";

// The known code universes. Kept in lockstep with the unions in upload.ts /
// mutations/documents.ts; the "no extra keys" tests below fail loudly if a code
// is added to a map without being added here (and vice versa).
const UPLOAD_CODES: UploadErrorCode[] = [
  "upload_failed",
  "file_too_large",
  "unsupported_type",
  "not_signed_in",
];

const DOCUMENT_CODES: DocumentRecordErrorCode[] = [
  "not_signed_in",
  "not_authorized",
  "no_student",
  "record_failed",
];

/** A translation key resolves when tx returns something other than the key
 *  itself (tx falls back to the raw key when a key is missing). */
function assertResolves(key: TranslationKey) {
  const en = tx(key, "en");
  const es = tx(key, "es");
  expect(en, `English translation missing for "${key}"`).not.toBe(key);
  expect(en.length).toBeGreaterThan(0);
  expect(es, `Spanish translation missing for "${key}"`).not.toBe(key);
  expect(es.length).toBeGreaterThan(0);
}

describe("UPLOAD_ERROR_TRANSLATION_KEY", () => {
  it("maps every storage upload code to a translation key that resolves in en and es", () => {
    for (const code of UPLOAD_CODES) {
      const key = UPLOAD_ERROR_TRANSLATION_KEY[code];
      expect(key, `missing mapping for upload code "${code}"`).toBeDefined();
      assertResolves(key);
    }
  });

  it("carries no keys beyond the known upload codes", () => {
    expect(Object.keys(UPLOAD_ERROR_TRANSLATION_KEY).sort()).toEqual([...UPLOAD_CODES].sort());
  });
});

describe("DOCUMENT_RECORD_ERROR_TRANSLATION_KEY", () => {
  it("maps every document-record code to a translation key that resolves in en and es", () => {
    for (const code of DOCUMENT_CODES) {
      const key = DOCUMENT_RECORD_ERROR_TRANSLATION_KEY[code];
      expect(key, `missing mapping for document code "${code}"`).toBeDefined();
      assertResolves(key);
    }
  });

  it("carries no keys beyond the known document-record codes", () => {
    expect(Object.keys(DOCUMENT_RECORD_ERROR_TRANSLATION_KEY).sort()).toEqual([...DOCUMENT_CODES].sort());
  });
});
