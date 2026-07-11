"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { staffGenerateCaptureLink } from "./actions";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campuses: { id: string; name: string; short_code: string }[];
}

export function ShareDialog({ open, onOpenChange, campuses }: ShareDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [campus, setCampus] = useState(campuses.length === 1 ? campuses[0].short_code : "");
  const [tag, setTag] = useState("");
  const [result, setResult] = useState<{ url: string; embedTag: string; qrDataUrl: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function generate() {
    setResult(null);
    startTransition(async () => {
      const r = await staffGenerateCaptureLink(campus, tag);
      setResult(r);
    });
  }

  function copy(text: string, which: string) {
    navigator.clipboard?.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share &amp; track</DialogTitle>
          <DialogDescription>
            Make a tagged link or QR code for a flyer, yard sign, or a page on the school website.
            Every family who uses it is tagged with your label, so the funnel shows exactly what worked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            {campuses.length > 1 && (
              <div>
                <label htmlFor="share-campus" className="block text-sm font-medium text-ink/70 mb-1">Campus</label>
                <Select id="share-campus" value={campus} onChange={(e) => setCampus(e.target.value)}>
                  <option value="">Choose…</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.short_code}>{c.name}</option>
                  ))}
                </Select>
              </div>
            )}
            <div className={campuses.length > 1 ? "" : "col-span-2"}>
              <label htmlFor="share-tag" className="block text-sm font-medium text-ink/70 mb-1">
                Label (where it goes)
              </label>
              <Input
                id="share-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="e.g. juneteenth-flyer, healthcare-page"
              />
            </div>
          </div>
          <Button onClick={generate} disabled={isPending || (campuses.length > 1 && !campus)}>
            {isPending ? "Generating…" : "Generate"}
          </Button>

          {result && (
            <div className="space-y-4 pt-2 border-t border-stone/15">
              <div>
                <p className="text-xs font-medium text-stone mb-1">Link (for a website page or text message)</p>
                <div className="flex gap-2">
                  <Input value={result.url} readOnly className="text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" variant="outline" onClick={() => copy(result.url, "url")}>
                    {copied === "url" ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-stone mb-1">QR code (for flyers, yard signs, tabling)</p>
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.qrDataUrl} alt="QR code" className="w-32 h-32 border border-stone/15 rounded-lg" />
                  <a href={result.qrDataUrl} download={`rooted-qr-${tag || "flyer"}.png`}>
                    <Button size="sm" variant="outline">Download PNG</Button>
                  </a>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-stone mb-1">
                  Embed on the school website (put the form <em>on</em> a page)
                </p>
                <div className="flex gap-2">
                  <textarea
                    value={result.embedTag}
                    readOnly
                    rows={2}
                    className="flex-1 rounded-md border border-stone/30 px-2 py-1.5 text-[11px] font-mono focus:border-rooted-green focus:outline-none"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button size="sm" variant="outline" onClick={() => copy(result.embedTag, "embed")}>
                    {copied === "embed" ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="text-[11px] text-stone mt-1">
                  Paste into a code block on the website. Never use the site&apos;s own form — this keeps every
                  lead in the pipeline.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
