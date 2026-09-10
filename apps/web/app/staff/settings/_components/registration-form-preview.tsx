"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getCompletionConfig } from "@/lib/registration-items";
import { tx, type TranslationKey } from "@/lib/i18n/translations";

/**
 * Read-only preview of exactly what a family is asked to complete for one
 * registration packet item. Renders the SAME schema the family form uses
 * (lib/registration-items.ts), so what staff see here can never drift from
 * what a family actually fills out. Labels resolve to English via tx(); the
 * controls are disabled — this is a look, not an entry point.
 */

const t = (key: TranslationKey) => tx(key, "en");

function FieldPreview({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-[6px] border border-line bg-sunken/40 px-2.5 py-1.5 text-sm text-stone";

export function RegistrationFormPreviewButton({
  itemType,
  name,
}: {
  itemType: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const config = getCompletionConfig(itemType);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Preview
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t(config.titleKey) || name}</DialogTitle>
            <DialogDescription>{t(config.descKey)}</DialogDescription>
          </DialogHeader>

          {config.mode === "form" && (
            <div className="space-y-3">
              {config.fields.map((field) => {
                const label = t(field.labelKey);
                const placeholder = field.placeholderKey ? t(field.placeholderKey) : "";
                if (field.type === "checkbox") {
                  return (
                    <label key={field.key} className="flex items-start gap-2 text-sm text-stone">
                      <input type="checkbox" disabled className="mt-0.5 h-4 w-4" />
                      <span>
                        {label}
                        {field.required && <span className="ml-0.5 text-red-600">*</span>}
                      </span>
                    </label>
                  );
                }
                return (
                  <FieldPreview key={field.key} label={label} required={field.required}>
                    {field.type === "textarea" ? (
                      <textarea disabled rows={2} placeholder={placeholder} className={inputClass} />
                    ) : field.type === "select" ? (
                      <select disabled className={inputClass}>
                        <option>{placeholder || "Select…"}</option>
                        {field.options?.map((o) => (
                          <option key={o.value}>{t(o.labelKey)}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === "phone" ? "tel" : field.type}
                        disabled
                        placeholder={placeholder}
                        className={inputClass}
                      />
                    )}
                  </FieldPreview>
                );
              })}
            </div>
          )}

          {config.mode === "acknowledge" && (
            <div className="rounded-[6px] border border-line bg-sunken/40 px-3 py-3 text-sm text-stone">
              The family reviews this policy and agrees with a checkbox / e-signature. No fields to
              fill in.
            </div>
          )}

          {config.mode === "upload" && (
            <div className="space-y-2">
              <div className="rounded-[6px] border border-dashed border-line bg-sunken/40 px-3 py-4 text-center text-sm text-stone">
                The family uploads a document here.
              </div>
              {config.exampleKeys.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-ink">Accepted examples</p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-stone">
                    {config.exampleKeys.map((k) => (
                      <li key={k}>{t(k)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <p className="mt-2 text-[11px] text-stone">
            Preview only — this is what the family sees; you can&apos;t submit from here.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
