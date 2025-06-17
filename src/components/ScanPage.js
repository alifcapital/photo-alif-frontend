import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Webcam from "react-webcam"; // Importing react-webcam
import { BrowserMultiFormatReader } from "@zxing/library"; // QR scanning library
import "../styles.css";

// Toast с анимацией входа/выхода
function Toast({ message, type = "info", onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return <div className={`toast toast--${type}`}>{message}</div>;
}

// Главный компонент ScanPage
export default function ScanPage() {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState(null);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState(null);

  const API = process.env.REACT_APP_API_URL || "";
  const token = localStorage.getItem("authToken");

  const readerRef = useRef(new BrowserMultiFormatReader()); // QR code reader reference

  // Handling the QR scanner detection
  const onDetected = (text) => {
    setClientId(text);
    alert(text);
    setToast({ message: "QR успешно обработан!", type: "success" });
  };

  const onError = (err) => {
    if (err.name === "NotAllowedError") {
      setToast({ message: "Доступ к камере запрещён", type: "error" });
    } else {
      setToast({ message: "Ошибка сканирования", type: "error" });
    }
    setScanning(false);
  };

  // Start scanning
  const handleStart = () => {
    if (scanning) return;
    setScanning(true);
    setIsStarted(true);
    handleScan();
  };

  // Stop scanning and reset state
  const handleReset = () => {
    setClientId(null);
    setImages([]);
    setScanning(false);
    setIsStarted(false);
  };

  // Take photo using react-webcam
  const webcamRef = React.useRef(null);

  const takePhoto = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setImages((prev) => [...prev, { url: imageSrc, isPassport: false }]);
    }
  };

  // Toggle passport status
  const togglePassport = (i) =>
    setImages((prev) =>
      prev.map((x, j) => (j === i ? { ...x, isPassport: !x.isPassport } : x))
    );

  // Delete photo
  const deletePhoto = (i) => {
    setImages((prev) => prev.filter((_, j) => j !== i));
  };

  // Upload all photos
  const uploadAll = async () => {
    setUploading(true);
    setDoneCount(0);

    try {
      for (let i = 0; i < images.length; i++) {
        const { url, isPassport } = images[i];
        const form = new FormData();
        form.append("client_id", clientId);
        form.append("image", url);
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
      setImages([]);
      setScanning(false);
    } finally {
      setUploading(false);
    }
  };

  // Logout function
  const handleLogout = () => {
    fetch(`${API}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    localStorage.clear();
    navigate("/login");
  };

  // QR code scanning logic
  const handleScan = useCallback(() => {
    const video = webcamRef.current?.video;
    if (video) {
      readerRef.current
        .decodeOnceFromVideoDevice(undefined, video)
        .then((result) => {
          onDetected(result.getText()); // Trigger onDetected if QR is scanned
        })
        .catch((err) => onError(err)); // Catch any scanning errors
    }
  }, []);

  useEffect(() => {
    if (isStarted && !clientId) {
      const interval = setInterval(() => {
        handleScan();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [isStarted, handleScan, clientId]);

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

      {/* Viewfinder and Webcam Stream */}
      <div className="viewfinder-container">
        {isStarted && (
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            width="100%"
            videoConstraints={{
              facingMode: "environment", // Ensures rear camera
              width: 1920, // Target resolution
              height: 1080,
              frameRate: { ideal: 30 },
            }}
          />
        )}
        {!scanning && clientId == null && (
          <button className="action-btn start-overlay" onClick={handleStart}>
            Начать сканирование QR
          </button>
        )}
      </div>

      {/* Controls */}

      {clientId && (
        <div className="controls">
          <div className="scan-success">QR успешно был обработан!</div>
          <div className="btn-group">
            <button className="action-btn" onClick={takePhoto}>
              Сделать фото
            </button>
            <button className="action-btn" onClick={handleReset}>
              Новый QR
            </button>
          </div>
        </div>
      )}

      {/* Gallery */}
      {images.length > 0 && (
        <div className="gallery">
          {images.map((img, i) => (
            <div key={i} className="gallery-item">
              <img src={img.url} alt={`Снимок ${i + 1}`} className="thumb" />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={img.isPassport}
                  onChange={() => togglePassport(i)}
                />
                Паспорт
              </label>
              <button className="delete-btn" onClick={() => deletePhoto(i)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Uploading photos */}
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
