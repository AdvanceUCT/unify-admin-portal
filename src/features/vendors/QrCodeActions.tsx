/**
 * @fileoverview Copies or downloads a branch service-point QR code.
 * @module features/vendors/QrCodeActions
 */

"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";

import { IconButton } from "@/components/ui/IconButton";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <IconButton
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      tone="ghost"
    >
      {copied ? <Check size={15} className="text-success-fg" /> : <Copy size={15} />}
    </IconButton>
  );
}

export function QrCodeActions({ svg, filename }: { svg: string; filename: string }) {
  function downloadSvg() {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    triggerDownload(URL.createObjectURL(blob), `${filename}.svg`);
  }

  function downloadPng() {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) triggerDownload(URL.createObjectURL(pngBlob), `${filename}.png`);
      }, "image/png");
    };

    img.src = url;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={downloadSvg}
        className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
      >
        <Download size={14} aria-hidden="true" />
        SVG
      </button>
      <button
        type="button"
        onClick={downloadPng}
        className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
      >
        <Download size={14} aria-hidden="true" />
        PNG
      </button>
    </div>
  );
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}
