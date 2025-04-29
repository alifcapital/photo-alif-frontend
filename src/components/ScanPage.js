// src/components/ScanPage.js
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/library";
import "../styles.css";

const MAX_DIMENSION = 1280;
const JPEG_QUALITY  = 0.8;

// Toast с анимацией входа/выхода
function Toast({ message, type = "info", onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className={`toast toast--${type}`}>
      {message}
    </div>
  );
}

// Хук для QR-сканирования + доступ к первому видеотреку
function useQrScanner(onDetected, onError) {
  const videoRef  = useRef(null);
  const readerRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef  = useRef(null);

  const startScan = useCallback(async () => {
    if (!videoRef.current.srcObject) {
      try {
        readerRef.current = new BrowserMultiFormatReader();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width:  { ideal: 4096 },
            height: { ideal: 2160 },
            frameRate: { ideal: 30 }
          }
        });
        streamRef.current = stream;
        trackRef.current  = stream.getVideoTracks()[0];
        videoRef.current.srcObject = stream;
      } catch (e) {
        onError?.(e);
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
      onError?.(e);
    }
  }, [onDetected, onError]);

  const stopScan = useCallback(() => {
    readerRef.current?.reset();
    streamRef.current?.getTracks().forEach(t => t.stop());
    videoRef.current && (videoRef.current.srcObject = null);
  }, []);

  return { videoRef, startScan, stopScan, trackRef };
}

// Viewfinder
function Viewfinder({ scanning, clientId, onStart, videoRef }) {
  return (
    <div className="viewfinder-container">
      <video ref={videoRef} className="video-stream" muted playsInline />
      {!scanning && clientId == null && (
        <button className="action-btn start-overlay" onClick={onStart}>
          Начать сканирование QR
        </button>
      )}
    </div>
  );
}

// Controls
function Controls({ clientId, onCapture, onReset }) {
  if (!clientId) return null;
  return (
    <div className="controls">
      <div className="scan-success">QR успешно был обработан!</div>
      <div className="btn-group">
        <button className="action-btn" onClick={onCapture}>
          Сделать фото
        </button>
        <button className="action-btn" onClick={onReset}>
          Новый QR
        </button>
      </div>
    </div>
  );
}

// Gallery
function Gallery({ images, onToggle, onDelete }) {
  if (images.length === 0) return null;
  return (
    <div className="gallery">
      {images.map((img, i) => (
        <div key={i} className="gallery-item">
          <img src={img.url} alt={`Снимок ${i + 1}`} className="thumb" />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={img.isPassport}
              onChange={() => onToggle(i)}
            />
            Паспорт
          </label>
          <button className="delete-btn" onClick={() => onDelete(i)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// Главный компонент ScanPage
export default function ScanPage() {
  const navigate = useNavigate();
  const [clientId, setClientId]   = useState(null);
  const [images, setImages]       = useState([]);
  const [uploading, setUploading] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [scanning, setScanning]   = useState(false);
  const [toast, setToast]         = useState(null);

  const API   = process.env.REACT_APP_API_URL || "";
  const token = localStorage.getItem("authToken");

  const { videoRef, startScan, stopScan, trackRef } = useQrScanner(
    text => {
      setClientId(text);
      setToast({ message: "QR успешно обработан!", type: "success" });
    },
    err => {
      if (err.name === "NotAllowedError") {
        setToast({ message: "Доступ к камере запрещён", type: "error" });
      } else {
        setToast({ message: "Ошибка сканирования", type: "error" });
      }
      setScanning(false);
    }
  );

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

  // Захват фото через ImageCapture для максимального качества
  const takePhoto = async () => {
    if (!trackRef.current) {
      setToast({ message: "Камера ещё не готова", type: "error" });
      return;
    }
    try {
      const imageCapture = new ImageCapture(trackRef.current);
      const blobOriginal = await imageCapture.takePhoto();
      const bitmap = await createImageBitmap(blobOriginal);
      let { width, height } = bitmap;
      let w = width, h = height;
      if (width > height && width > MAX_DIMENSION) {
        w = MAX_DIMENSION;
        h = Math.round((MAX_DIMENSION / width) * height);
      } else if (height >= width && height > MAX_DIMENSION) {
        h = MAX_DIMENSION;
        w = Math.round((MAX_DIMENSION / height) * width);
      }
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, w, h);
      canvas.toBlob(resizedBlob => {
        if (!resizedBlob) return;
        const url = URL.createObjectURL(resizedBlob);
        setImages(prev => [...prev, { url, blob: resizedBlob, isPassport: false }]);
      }, "image/jpeg", JPEG_QUALITY);
    } catch {
      setToast({ message: "Не удалось снять фото", type: "error" });
    }
  };

  const togglePassport = i =>
    setImages(prev =>
      prev.map((x,j) => (j === i ? { ...x, isPassport: !x.isPassport } : x))
    );
  const deletePhoto = i => {
    URL.revokeObjectURL(images[i].url);
    setImages(prev => prev.filter((_, j) => j !== i));
  };

  // Параллельная загрузка + счетчик прогресса
  const uploadAll = () => {
    setUploading(true);
    setDoneCount(0);
    images.forEach(({ blob, isPassport }, idx) => {
      const form = new FormData();
      form.append("client_id", clientId);
      form.append("image", blob);
      form.append("is_passport", isPassport ? "1" : "0");
      fetch(`${API}/api/upload-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      .then(res => {
        setDoneCount(c => c + 1);
        if (!res.ok) {
          setToast({ message: `Фото ${idx+1} не загрузилось`, type: "error" });
        }
      })
      .catch(() => {
        setDoneCount(c => c + 1);
        setToast({ message: `Ошибка загрузки фото ${idx+1}`, type: "error" });
      });
    });
  };

  // По завершении всех загрузок — стоп камеры и сброс
  useEffect(() => {
    if (uploading && doneCount === images.length && images.length > 0) {
      setToast({ message: "Все фото загружены!", type: "success" });
      images.forEach(img => URL.revokeObjectURL(img.url));
      setImages([]);
      setUploading(false);
      // автоматически выключаем камеру
      stopScan();
    }
  }, [doneCount, images, uploading, stopScan]);

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
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

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
              ? `Загружено ${doneCount} / ${images.length}`
              : "Загрузить в папку"}
          </button>
        </div>
      )}
    </div>
  );
}
