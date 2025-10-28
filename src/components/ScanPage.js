import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/library";
import "../styles.css";

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

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

  const { videoRef, startScan, stopScan } = useQrScanner(
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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("getUserMedia не поддерживается этим браузером.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          ...(isIOS
            ? {
                width: { ideal: 2048 },
                height: { ideal: 1536 },
              }
            : {
                width: { ideal: 1280, max: 1280 },
                height: { ideal: 720, max: 720 },
                frameRate: { ideal: 15, max: 30 },
              }),
        },
      });

      const videoElement = videoRef.current;
      videoElement.srcObject = stream;

      // Ждём, пока видео загрузится
      await new Promise((resolve) => {
        videoElement.onloadedmetadata = () => {
          videoElement.play();
          console.log("Видео начало воспроизводиться.");
        };
        videoElement.onplay = () => resolve();
      });

      // Ждём 300 мс чтобы автоэкспозиция сработала
      await new Promise((res) => setTimeout(res, 500));

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const videoWidth = videoElement.videoWidth;
      const videoHeight = videoElement.videoHeight;
      if (videoWidth === 0 || videoHeight === 0) {
        throw new Error("Невозможно захватить видео, размеры равны 0");
      }

      canvas.width = videoWidth;
      canvas.height = videoHeight;

      ctx.drawImage(videoElement, 0, 0, videoWidth, videoHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.error("Ошибка: blob не был создан.");
            return;
          }

          const url = URL.createObjectURL(blob);
          setImages((prevImages) => [...prevImages, { blob, url }]);
          console.log("Фото успешно сделано и сохранено.");
        },
        "image/jpeg",
        0.95
      );
    } catch (error) {
      console.error("Ошибка при попытке сделать фото:", error);
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

  const uploadAll = async () => {
    setUploading(true);
    setDoneCount(0);

    try {
      for (let i = 0; i < images.length; i++) {
        const { blob, isPassport } = images[i];

        // Отправляем blob напрямую, а не URL
        const form = new FormData();
        form.append("client_id", clientId);
        form.append("image", blob, `image_${i}.jpg`); // Просто добавляем Blob
        form.append("is_passport", isPassport ? "1" : "0");

        const res = await fetch(`${API}/api/upload-image`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        });

        const responseData = await res.json();
        console.log("Ответ от сервера:", responseData);

        if (res.ok) {
          setDoneCount(i + 1);
        } else {
          console.error(`Ошибка загрузки фото ${i + 1}:`, responseData);
          setToast({
            message: `Фото ${i + 1} не загрузилось`,
            type: "error",
          });
        }
      }

      setToast({ message: "Все фото загружены!", type: "success" });
      setImages([]); // Очистка списка после загрузки
      stopScan();
    } catch (error) {
      console.error("Ошибка при загрузке всех фотографий:", error);
      setToast({
        message: "Ошибка при загрузке фотографий",
        type: "error",
      });
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

  alert("Test....");

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
