// src/components/ScanPage.js
import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/library";
import "../styles.css";

const MAX_DIMENSION = 1280;       // максимальная сторона фото в px
const JPEG_QUALITY = 0.8;        // JPEG-качество при toBlob
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/bmp",
  "image/heic",
  "image/heif",
];

// —————————————————————————————
// QR-хук без изменений
function useQrScanner(onDetected) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const streamRef = useRef(null);

  const startScan = useCallback(async () => {
    if (!videoRef.current.srcObject) {
      try {
        readerRef.current = new BrowserMultiFormatReader();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
      } catch (e) {
        console.error("getUserMedia error:", e);
        return;
      }
    }
    try {
      await videoRef.current.play();
      const result = await readerRef.current.decodeOnceFromVideoDevice(
        undefined,
        videoRef.current
      );
      onDetected(result.getText());
    } catch (e) {
      console.error("QR decode error:", e);
    }
  }, [onDetected]);

  const stopScan = useCallback(() => {
    readerRef.current?.reset();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  return { videoRef, startScan, stopScan };
}

// —————————————————————————————
// остальные презентационные компоненты оставляем без изменений:
// Viewfinder, Controls, Gallery…

// —————————————————————————————
// главный компонент
export default function ScanPage() {
  const navigate = useNavigate();
  const [clientId, setClientId]   = useState(null);
  const [images, setImages]       = useState([]); // { url, blob, isPassport }
  const [uploading, setUploading] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [scanning, setScanning]   = useState(false);
  const API   = process.env.REACT_APP_API_URL || "";
  const token = localStorage.getItem("authToken");

  const { videoRef, startScan, stopScan } = useQrScanner(text => {
    setClientId(text);
  });

  const handleStart = () => {
    if (scanning) return;
    setScanning(true);
    startScan();
  };
  const handleReset = () => {
    stopScan();
    setClientId(null);
    setImages([]);
    setScanning(false);
  };

  // захват + ресайз до MAX_DIMENSION
  const takePhoto = () => {
    const video = videoRef.current;
    const vw = video.videoWidth, vh = video.videoHeight;
    // считаем новую размерность
    let w = vw, h = vh;
    if (vw > vh && vw > MAX_DIMENSION) {
      w = MAX_DIMENSION;
      h = Math.round((MAX_DIMENSION / vw) * vh);
    } else if (vh >= vw && vh > MAX_DIMENSION) {
      h = MAX_DIMENSION;
      w = Math.round((MAX_DIMENSION / vh) * vw);
    }
    // рисуем на canvas нужного размера
    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(video, 0, 0, vw, vh, 0, 0, w, h);
    // получаем blob с компрессией
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setImages(prev => [...prev, { url, blob, isPassport: false }]);
    }, "image/jpeg", JPEG_QUALITY);
  };

  const togglePassport = i =>
    setImages(prev =>
      prev.map((x, j) => j === i ? { ...x, isPassport: !x.isPassport } : x)
    );
  const deletePhoto = i => {
    URL.revokeObjectURL(images[i].url);
    setImages(prev => prev.filter((_, j) => j !== i));
  };

  // параллельная загрузка с прогрессом
  const uploadAll = async () => {
    setUploading(true);
    setDoneCount(0);
    const total = images.length;

    const tasks = images.map(({ blob, isPassport }, idx) => {
      const form = new FormData();
      form.append("client_id", clientId);
      form.append("image", blob);
      form.append("is_passport", isPassport ? "1" : "0");
      return fetch(`${API}/api/upload-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      .then(res => {
        setDoneCount(c => c + 1);
        if (!res.ok) console.error(`Фото ${idx+1} не загрузилось:`, res.statusText);
      })
      .catch(err => {
        setDoneCount(c => c + 1);
        console.error(`Ошибка загрузки фото ${idx+1}:`, err);
      });
    });

    await Promise.all(tasks);
    alert("Загрузка завершена");
    images.forEach(img => URL.revokeObjectURL(img.url));
    setImages([]);
    setUploading(false);
  };

  const handleLogout = () => {
    fetch(`${API}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    stopScan();
    localStorage.clear();
    navigate("/login");
  };

  return (
    <div className="scan-page">
      <header className="header">
        <div className="logo">photo.alif.tj</div>
        <button className="logout-btn" onClick={handleLogout}>
          <img src="logout_icon.png" alt="Logout" />
        </button>
      </header>

      <Viewfinder
        scanning={scanning}
        clientId={clientId}
        onStart={handleStart}
        videoRef={videoRef}
      />

      <Controls
        clientId={clientId}
        onCapture={takePhoto}
        onReset={handleReset}
      />

      <Gallery
        images={images}
        onToggle={togglePassport}
        onDelete={deletePhoto}
      />

      {images.length > 0 && (
        <div className="controls">
          <button
            className="action-btn upload-btn"
            onClick={uploadAll}
            disabled={uploading}
          >
            {uploading
              ? `Загрузка ${doneCount} / ${images.length}…`
              : "Загрузить в папку"}
          </button>
        </div>
      )}
    </div>
  );
}