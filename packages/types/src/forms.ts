// Dynamic form field definitions for FormTemplate.fields JSONB

import { FormFieldType } from "./enums";

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormFieldValidation {
  required?: boolean;
  min_length?: number;
  max_length?: number;
  min?: number;
  max?: number;
  pattern?: string;
  pattern_message?: string;
  accepted_file_types?: string[];
  max_file_size_mb?: number;
}

export interface FormFieldConditional {
  field_key: string;
  operator: "equals" | "not_equals" | "contains" | "is_true" | "is_false";
  value?: string;
}

export interface FormFieldDefinition {
  key: string;
  type: FormFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  section?: string;
  order: number;
  validation?: FormFieldValidation;
  options?: FormFieldOption[];
  conditional?: FormFieldConditional;
  default_value?: unknown;
  is_pii?: boolean;
  help_text?: string;
}
