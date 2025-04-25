// src/components/ScanPage.js
import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/library";
import "../styles.css";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const COMPRESSION_QUALITY = 0.9; // чуть-чуть сжать, сохранить читаемость для OCR
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/bmp",
  "image/heic",
  "image/heif",
];

// —————————————————————————————
// хук для сканирования QR
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
      if (videoRef.current.paused || videoRef.current.readyState < 3) {
        await videoRef.current.play();
      }
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
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  return { videoRef, startScan, stopScan };
}

// —————————————————————————————
// окно сканирования
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

// —————————————————————————————
// кнопки работы с отсканированным клиентом
function Controls({ clientId, onCapture, onReset }) {
  if (!clientId) return null;
  return (
    <div className="controls">
      <p className="scan-success">QR успешно был обработан!</p>
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

// —————————————————————————————
// галерея превью
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

// —————————————————————————————
// главный компонент
export default function ScanPage() {
  const navigate = useNavigate();
  const [clientId, setClientId]   = useState(null);
  const [images, setImages]       = useState([]);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning]   = useState(false);
  const API   = process.env.REACT_APP_API_URL || "";
  const token = localStorage.getItem("authToken");

  const { videoRef, startScan, stopScan } = useQrScanner(text => {
    setClientId(text);
    // не сбрасываем scanning, чтобы стартовая кнопка не вернулась
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

  // захват полного кадра в исходном разрешении и лёгкая компрессия
  const takePhoto = () => {
    const video = videoRef.current;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width  = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, vw, vh);
    canvas.toBlob(blob => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setImages(p => [...p, { url, blob, isPassport: false }]);
      }
    }, "image/jpeg", COMPRESSION_QUALITY);
  };

  const togglePassport = i =>
    setImages(p =>
      p.map((x,j) =>
        j === i ? { ...x, isPassport: !x.isPassport } : x
      )
    );

  const deletePhoto = i => {
    URL.revokeObjectURL(images[i].url);
    setImages(p => p.filter((_,j) => j !== i));
  };

  // параллельная загрузка
  const uploadAll = async () => {
    setUploading(true);
    const tasks = images.map(({ blob, isPassport }) => {
      const form = new FormData();
      form.append("client_id", clientId);
      form.append("image", blob);
      form.append("is_passport", isPassport ? "1" : "0");
      return fetch(`${API}/api/upload-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    });
    const results = await Promise.allSettled(tasks);
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && !r.value.ok) {
        console.error(`Фото ${i+1} не загрузилось:`, r.value.statusText);
      } else if (r.status === "rejected") {
        console.error(`Ошибка загрузки фото ${i+1}:`, r.reason);
      }
    });
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
          <img src="logout_icon.png" alt="Logout"/>
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
            {uploading ? "Загрузка..." : "Загрузить в папку"}
          </button>
        </div>
      )}
    </div>
  );
}