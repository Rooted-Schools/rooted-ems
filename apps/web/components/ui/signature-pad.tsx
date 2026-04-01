"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  placeholder?: string;
  drawInstruction?: string;
  clearLabel?: string;
}

/**
 * Canvas-based signature capture pad.
 * Supports mouse and touch input.
 * Calls onChange(dataUrl) when the user finishes a stroke, onChange(null) on clear.
 */
export function SignaturePad({
  onChange,
  placeholder = "Sign here",
  drawInstruction = "Draw your signature above using your mouse or finger",
  clearLabel = "Clear",
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Initialize canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas resolution to match its CSS size (handles HiDPI)
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPoint(
    e: { clientX: number; clientY: number },
    canvas: HTMLCanvasElement
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function startDrawing(point: { x: number; y: number }) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    isDrawing.current = true;
    lastPoint.current = point;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function draw(point: { x: number; y: number }) {
    if (!isDrawing.current || !lastPoint.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
  }

  function finishDrawing() {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPoint.current = null;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setIsEmpty(false);
    onChange(dataUrl);
  }

  // Mouse handlers
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    startDrawing(getPoint(e.nativeEvent, canvas));
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(getPoint(e.nativeEvent, canvas));
  }, []);

  const onMouseUp = useCallback(() => finishDrawing(), []);
  const onMouseLeave = useCallback(() => {
    if (isDrawing.current) finishDrawing();
  }, []);

  // Touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const touch = e.touches[0];
    if (touch) startDrawing(getPoint(touch, canvas));
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !isDrawing.current) return;
    const touch = e.touches[0];
    if (touch) draw(getPoint(touch, canvas));
  }, []);

  const onTouchEnd = useCallback(() => finishDrawing(), []);

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setIsEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg border-2 border-dashed border-stone/30 bg-white overflow-hidden">
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-stone/50 select-none">{placeholder}</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "120px", touchAction: "none" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-label="Signature pad — draw your signature here"
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-stone">
          {drawInstruction}
        </p>
        <button
          type="button"
          onClick={handleClear}
          disabled={isEmpty}
          className="text-xs text-rooted-green hover:underline disabled:text-stone/40 disabled:no-underline"
        >
          {clearLabel}
        </button>
      </div>
    </div>
  );
}
