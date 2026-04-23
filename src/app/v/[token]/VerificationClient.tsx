"use client";
// src/app/v/[token]/VerificationClient.tsx
// Client-side verification page.
// Collects browser fingerprint, then submits to the verification API.

import { useState, useEffect, useCallback } from "react";
import type { FingerprintData, VerificationPageState } from "@/types";
import styles from "./verification.module.css";

interface Props {
  rawToken: string;
  initialState: VerificationPageState;
}

type PagePhase = "idle" | "collecting" | "submitting" | "success" | "error";

export function VerificationClient({ rawToken, initialState }: Props) {
  const [phase, setPhase] = useState<PagePhase>(
    initialState.status === "valid" ? "idle" : "error"
  );
  const [errorMessage, setErrorMessage] = useState(
    initialState.status !== "valid" ? initialState.message : ""
  );

  const collectFingerprint = useCallback(async (): Promise<FingerprintData> => {
    // Collect what's available without requiring any external library
    const data: FingerprintData = {
      userAgent: navigator.userAgent,
      language: navigator.language ?? null,
      platform: navigator.platform ?? null,
      screenWidth: window.screen.width ?? null,
      screenHeight: window.screen.height ?? null,
      colorDepth: window.screen.colorDepth ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
      canvasHash: await getCanvasHash(),
      webglHash: getWebGLHash(),
      fonts: null, // Requires dedicated font-detection — omitted to avoid long load times
      plugins: getPluginList(),
      cookiesEnabled: navigator.cookieEnabled ?? null,
      doNotTrack: navigator.doNotTrack ?? null,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemory: (navigator as unknown as Record<string, unknown>).deviceMemory as number ?? null,
      touchPoints: navigator.maxTouchPoints ?? null,
      connectionType: getConnectionType(),
    };
    return data;
  }, []);

  const handleVerify = useCallback(async () => {
    setPhase("collecting");

    let fingerprint: FingerprintData;
    try {
      fingerprint = await collectFingerprint();
    } catch {
      fingerprint = { userAgent: navigator.userAgent } as FingerprintData;
    }

    setPhase("submitting");

    try {
      const res = await fetch("/api/v", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken, fingerprint }),
      });

      const json = await res.json();

      if (json.success) {
        setPhase("success");
      } else {
        setPhase("error");
        setErrorMessage(json.message ?? "Verification failed. Please try again.");
      }
    } catch {
      setPhase("error");
      setErrorMessage("Network error. Please check your connection and try again.");
    }
  }, [rawToken, collectFingerprint]);

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#5865F2"/>
            <path d="M12 20l6 6 10-12" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className={styles.logoText}>VeriFry</span>
        </div>

        {phase === "idle" && (
          <div className={styles.content}>
            <h1 className={styles.heading}>Identity Verification</h1>
            <p className={styles.subtext}>
              Complete this step to verify your identity on the server.
              Your device information will be reviewed by an administrator
              before your role is assigned.
            </p>
            <div className={styles.infoBox}>
              <p>What gets collected:</p>
              <ul>
                <li>Your IP address and approximate location</li>
                <li>Browser and device details</li>
                <li>A browser fingerprint for fraud detection</li>
              </ul>
            </div>
            <button className={styles.button} onClick={handleVerify}>
              Complete Verification
            </button>
          </div>
        )}

        {phase === "collecting" && (
          <div className={styles.content}>
            <Spinner />
            <p className={styles.statusText}>Collecting device information...</p>
          </div>
        )}

        {phase === "submitting" && (
          <div className={styles.content}>
            <Spinner />
            <p className={styles.statusText}>Submitting your verification...</p>
          </div>
        )}

        {phase === "success" && (
          <div className={styles.content}>
            <div className={styles.successIcon}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="24" fill="#23a55a" opacity="0.15"/>
                <circle cx="24" cy="24" r="18" fill="#23a55a" opacity="0.25"/>
                <path d="M15 24l7 7 11-14" stroke="#23a55a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h1 className={styles.heading}>Verification Submitted</h1>
            <p className={styles.subtext}>
              Your information has been sent to the server administrators for review.
              You will be notified in Discord once your role has been assigned.
            </p>
            <p className={styles.subtext} style={{ opacity: 0.5, fontSize: "0.85rem" }}>
              You may now close this window.
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className={styles.content}>
            <div className={styles.errorIcon}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="24" fill="#ed4245" opacity="0.15"/>
                <circle cx="24" cy="24" r="18" fill="#ed4245" opacity="0.2"/>
                <path d="M16 16l16 16M32 16L16 32" stroke="#ed4245" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </div>
            <h1 className={styles.heading}>Verification Failed</h1>
            <p className={styles.subtext}>{errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 40, height: 40,
      border: "3px solid rgba(88,101,242,0.2)",
      borderTopColor: "#5865F2",
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
      margin: "0 auto 1.5rem",
    }} />
  );
}

// ──────────────────────────────────────────────
// Fingerprint helpers
// ──────────────────────────────────────────────

async function getCanvasHash(): Promise<string | null> {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("VeriFry fingerprint 🔍", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("VeriFry fingerprint 🔍", 4, 17);

    return canvas.toDataURL().slice(-64); // Last 64 chars as a proxy hash
  } catch {
    return null;
  }
}

function getWebGLHash(): string | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return null;

    const renderer = gl.getParameter(gl.RENDERER);
    const vendor = gl.getParameter(gl.VENDOR);
    return `${vendor}::${renderer}`.slice(0, 128);
  } catch {
    return null;
  }
}

function getPluginList(): string[] | null {
  try {
    return Array.from(navigator.plugins).map((p) => p.name);
  } catch {
    return null;
  }
}

function getConnectionType(): string | null {
  try {
    const conn = (navigator as unknown as Record<string, unknown>).connection as Record<string, unknown> | undefined;
    return (conn?.effectiveType as string) ?? null;
  } catch {
    return null;
  }
}
