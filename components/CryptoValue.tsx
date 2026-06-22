"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { truncateId } from "@/lib/utils";

export function CryptoValue({
  value,
  truncate = true,
  label,
}: {
  value: string;
  truncate?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return (
    <span className="inline-flex items-center gap-2">
      {label && <span className="eyebrow">{label}</span>}
      <span className="crypto text-[12.5px] text-muted">
        {truncate ? truncateId(value) : value}
      </span>
      <button
        onClick={copy}
        aria-label="Copy value"
        className="text-faint transition-colors hover:text-bone"
      >
        {copied ? <Check size={13} className="text-verdigris" /> : <Copy size={13} />}
      </button>
    </span>
  );
}
