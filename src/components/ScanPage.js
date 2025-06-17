// src/components/ScanPage.js
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/library";
import "../styles.css";

// Toast с анимацией входа/выхода
function Toast({ message, type = "info", onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return <div className={`toast toast--${type}`}>{message}</div>;
}

// Хук для QR-сканирования и доступа к видеотреку
function useQrScanner(onDetected, onError) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);

  const startScan = useCallback(async () => {
    if (!videoRef.current.srcObject) {
      try {
        readerRef.current = new BrowserMultiFormatReader();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 4096 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
            facingMode: {
              ideal: "environment",
            },
          },
        });
        streamRef.current = stream;
        trackRef.current = stream.getVideoTracks()[0];
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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  return { videoRef, startScan, stopScan, trackRef };
}

// Viewfinder — окно с видео и кнопкой старта
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

// Controls — кнопки «Сделать фото» и «Новый QR»
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

// Gallery — превью снятых фото
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
  const [clientId, setClientId] = useState(null);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState(null);

  const API = process.env.REACT_APP_API_URL || "";
  const token = localStorage.getItem("authToken");

  const { videoRef, startScan, stopScan, trackRef } = useQrScanner(
    (text) => {
      setClientId(text);
      setToast({ message: "QR успешно обработан!", type: "success" });
    },
    (err) => {
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

  const takePhoto = async () => {
    // Сначала получаем доступ к камере с нужным разрешением
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 }, // Максимальное разрешение 1920px по ширине
            height: { ideal: 1080 }, // 1080px по высоте
            facingMode: 'environment' // Камера на задней стороне
          }
        });
  
        const videoElement = videoRef.current;
        videoElement.srcObject = stream;
  
        // После того как видео начало воспроизводиться, снимаем фото
        const track = stream.getVideoTracks()[0];
        const capture = new ImageCapture(track);
  
        // Устанавливаем более высокое разрешение для фото
        const settings = { 
          width: 1920,  // Ожидаемое разрешение
          height: 1080  // Ожидаемое разрешение
        };
  
        const photo = await capture.grabFrame(settings);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Устанавливаем размер холста для заданного разрешения
        canvas.width = settings.width;
        canvas.height = settings.height;
        ctx.drawImage(photo, 0, 0, settings.width, settings.height);
  
        // Генерация изображения с максимальным качеством
        const imageUrl = canvas.toDataURL('image/jpeg', 1.0);  // 1.0 для максимального качества
        setImages((prevImages) => [...prevImages, { url: imageUrl }]);
  
      } catch (error) {
        console.error("Error capturing image:", error);
      }
    }
  };

  const togglePassport = (i) =>
    setImages((prev) =>
      prev.map((x, j) => (j === i ? { ...x, isPassport: !x.isPassport } : x))
    );
  const deletePhoto = (i) => {
    URL.revokeObjectURL(images[i].url);
    setImages((prev) => prev.filter((_, j) => j !== i));
  };

  // Последовательная загрузка фото
  const uploadAll = async () => {
    setUploading(true);
    setDoneCount(0);

    try {
      for (let i = 0; i < images.length; i++) {
        const { blob, isPassport } = images[i];
        const form = new FormData();
        form.append("client_id", clientId);
        form.append("image", blob);
        form.append("is_passport", isPassport ? "1" : "0");

        try {
          const res = await fetch(`${API}/api/upload-image`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });

          setDoneCount(i + 1);

          if (!res.ok) {
            setToast({
              message: `Фото ${i + 1} не загрузилось`,
              type: "error",
            });
          }
        } catch (error) {
          setDoneCount(i + 1);
          setToast({
            message: `Ошибка загрузки фото ${i + 1}`,
            type: "error",
          });
        }
      }

      setToast({ message: "Все фото загружены!", type: "success" });
      images.forEach((img) => URL.revokeObjectURL(img.url));
      setImages([]);
      stopScan();
    } finally {
      setUploading(false);
    }
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
