// src/components/ScanPage.js
import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/library";
import "../styles.css";

const MAX_DIMENSION     = 1280;   // максимальная сторона фото в px
const JPEG_QUALITY      = 0.8;    // качество JPEG при toBlob
// const ALLOWED_TYPES     = [       // если захотите проверять тип
//   "image/jpeg",
//   "image/png",
//   "image/bmp",
//   "image/heic",
//   "image/heif",
// ];

// —————————————————————————————
// хук для сканирования QR
function useQrScanner(onDetected) {
  const videoRef  = useRef(null);
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
// интерфейс сканера
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
// кнопки после сканирования
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
// галерея превью снимков
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
// главный компонент страницы ScanPage
export default function ScanPage() {
  const navigate = useNavigate();
  const [clientId, setClientId]   = useState(null);
  const [images, setImages]       = useState([]); // { url, blob, isPassport }
  const [uploading, setUploading] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [scanning, setScanning]   = useState(false);
  const API    = process.env.REACT_APP_API_URL || "";
  const token  = localStorage.getItem("authToken");

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
    let w = vw, h = vh;
    if (vw > vh && vw > MAX_DIMENSION) {
      w = MAX_DIMENSION;
      h = Math.round((MAX_DIMENSION / vw) * vh);
    } else if (vh >= vw && vh > MAX_DIMENSION) {
      h = MAX_DIMENSION;
      w = Math.round((MAX_DIMENSION / vh) * vw);
    }
    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(video, 0, 0, vw, vh, 0, 0, w, h);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setImages(prev => [...prev, { url, blob, isPassport: false }]);
    }, "image/jpeg", JPEG_QUALITY);
  };

  const togglePassport = i =>
    setImages(prev =>
      prev.map((x,j) => j === i ? { ...x, isPassport: !x.isPassport } : x)
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
        if (!res.ok) console.error(`Фото ${idx+1} не загрузилось:`, res.statusText);
      })
      .catch(err => {
        setDoneCount(c => c + 1);
        console.error(`Ошибка загрузки фото ${idx+1}:`, err);
      });
    });

    // ждём, пока все increment-запросы отработают
    while (doneCount < total) {
      // простой блокирующий wait
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 200));
    }

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
              ? `Загрузка ${doneCount} / ${images.length}`
              : "Загрузить в папку"}
          </button>
        </div>
      )}
    </div>
  );
}
