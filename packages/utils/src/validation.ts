import { z } from "zod";
import { FormFieldType } from "@rooted-ems/types";
import type { FormFieldDefinition } from "@rooted-ems/types";

/**
 * Build a Zod schema dynamically from an array of FormFieldDefinitions.
 * Used to validate application answers at runtime against
 * the form_template.fields JSONB configuration.
 */
export function buildDynamicZodSchema(
  fields: FormFieldDefinition[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let fieldSchema = buildFieldSchema(field);

    if (field.validation?.required) {
      // For strings, required means non-empty
      if (fieldSchema instanceof z.ZodString) {
        fieldSchema = fieldSchema.min(1, `${field.label} is required`);
      }
    } else {
      fieldSchema = fieldSchema.optional();
    }

    shape[field.key] = fieldSchema;
  }

  return z.object(shape);
}

function buildFieldSchema(field: FormFieldDefinition): z.ZodTypeAny {
  const v = field.validation;

  switch (field.type) {
    case FormFieldType.Text:
    case FormFieldType.Textarea: {
      let schema = z.string();
      if (v?.min_length) schema = schema.min(v.min_length);
      if (v?.max_length) schema = schema.max(v.max_length);
      if (v?.pattern) {
        schema = schema.regex(
          new RegExp(v.pattern),
          v.pattern_message ?? "Invalid format"
        );
      }
      return schema;
    }

    case FormFieldType.Email:
      return z.string().email("Invalid email address");

    case FormFieldType.Phone:
      return z
        .string()
        .regex(/^\+?[\d\s\-().]{7,20}$/, "Invalid phone number");

    case FormFieldType.Number: {
      let schema = z.number();
      if (v?.min !== undefined) schema = schema.min(v.min);
      if (v?.max !== undefined) schema = schema.max(v.max);
      return schema;
    }

    case FormFieldType.Date:
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format");

    case FormFieldType.Select:
    case FormFieldType.Radio: {
      if (field.options && field.options.length > 0) {
        const values = field.options.map((o) => o.value);
        return z.enum(values as [string, ...string[]]);
      }
      return z.string();
    }

    case FormFieldType.MultiSelect: {
      if (field.options && field.options.length > 0) {
        const values = field.options.map((o) => o.value);
        return z.array(z.enum(values as [string, ...string[]]));
      }
      return z.array(z.string());
    }

    case FormFieldType.Checkbox:
      return z.boolean();

    case FormFieldType.FileUpload:
      // File uploads are validated separately (storage layer).
      // The answer value stores the file reference/path.
      return z.string();

    case FormFieldType.Address:
      return z.object({
        line1: z.string().min(1),
        line2: z.string().optional(),
        city: z.string().min(1),
        state: z.string().min(1),
        zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code"),
      });

    case FormFieldType.Signature:
      // Signature data stored as base64 or URL string
      return z.string().min(1, "Signature is required");

    default:
      return z.unknown();
  }
}

// ============================================
// Common Reusable Schemas
// ============================================

export const emailSchema = z.string().email("Invalid email address");

export const phoneSchema = z
  .string()
  .regex(/^\+?[\d\s\-().]{7,20}$/, "Invalid phone number");

export const uuidSchema = z.string().uuid("Invalid ID");

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(25),
});

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");

export const zipCodeSchema = z
  .string()
  .regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code");
