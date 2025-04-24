// src/components/ScanPage.js
import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/library";
import "../styles.css";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/bmp"];

export default function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef();
  const overlayCanvas = useRef();
  const codeReader = useRef(null);
  const streamRef = useRef(null);

  const [clientId, setClientId] = useState(null);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);

  const API = process.env.REACT_APP_API_URL || "";
  const token = localStorage.getItem("authToken");

  // Запустить камеру и сканер по кнопке
  const startScanning = async () => {
    setScanning(true);
    codeReader.current = new BrowserMultiFormatReader();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 15 },
        },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // однократное сканирование
      const result = await codeReader.current.decodeOnceFromVideoDevice(
        undefined,
        videoRef.current
      );
      drawOverlay(result.getResultPoints());
      setClientId(result.getText());
      setTimeout(clearOverlay, 2000);
    } catch (e) {
      console.error("Scan error:", e);
    }
  };

  const drawOverlay = (points) => {
    if (!points?.length) return;
    const canvas = overlayCanvas.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#76da8b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(points[0].getX(), points[0].getY());
    points.forEach((p) => ctx.lineTo(p.getX(), p.getY()));
    ctx.closePath();
    ctx.stroke();
  };

  const clearOverlay = () => {
    const canvas = overlayCanvas.current;
    if (canvas)
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  };

  const resetScan = async () => {
    codeReader.current.reset();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setClientId(null);
    setImages([]);
    clearOverlay();
    setScanning(false);
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setImages((prev) => [...prev, { src: dataUrl, isPassport: false }]);
  };

  const togglePassport = (index) => {
    setImages((prev) =>
      prev.map((img, i) =>
        i === index ? { ...img, isPassport: !img.isPassport } : img
      )
    );
  };

  const deletePhoto = (index) =>
    setImages((prev) => prev.filter((_, i) => i !== index));

  const uploadAll = async () => {
    setUploading(true);
    try {
      for (const img of images) {
        // Convert base64 to blob more efficiently
        const base64Response = await fetch(img.src);
        const blob = await base64Response.blob();

        console.log("Image blob:", {
          size: blob.size,
          type: blob.type,
          base64Length: img.src.length,
        });

        if (blob.size > MAX_FILE_SIZE) {
          alert("Одна из фотографий слишком большая (макс. 5 МБ)");
          continue;
        }
        if (!ALLOWED_TYPES.includes(blob.type)) {
          alert("Недопустимый формат файла. Используйте JPEG/PNG/BMP.");
          continue;
        }

        const form = new FormData();
        form.append("client_id", clientId);
        // Use a more specific filename with timestamp
        form.append(
          "image",
          blob,
          `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`
        );
        form.append("is_passport", img.isPassport ? "1" : "0");

        const res = await fetch(`${API}/api/upload-image`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        });

        if (!res.ok) {
          const errorText = await res.text();

          throw new Error(
            `Upload failed: ${res.status} ${res.statusText}\n${errorText}`
          );
        }
      }
      alert("Все фото успешно загружены");
      setImages([]);
    } catch (error) {
      console.error("Upload error:", error);
      alert(`Ошибка при загрузке: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
    localStorage.clear();
    navigate("/login");
  };

  return (
    <div className="scan-page">
      <header className="header">
        <div className="logo">photo.alif.tj</div>
        <img
          src="/logout_icon.png"
          className="logout-btn"
          onClick={handleLogout}
        />
      </header>

      <div className="viewfinder-container">
        {scanning ? (
          <>
            <video ref={videoRef} className="video-stream" muted playsInline />
            <canvas ref={overlayCanvas} className="overlay-canvas" />
          </>
        ) : (
          <button className="action-btn" onClick={startScanning}>
            Начать сканирование QR
          </button>
        )}
      </div>

      <div className="controls">
        {clientId && <p className="scan-success">QR успешно был обработан!</p>}
        {clientId && (
          <div className="btn-group">
            <button className="action-btn" onClick={takePhoto}>
              Сделать фото
            </button>
            <button className="action-btn" onClick={resetScan}>
              Новый QR
            </button>
          </div>
        )}
      </div>

      <div className="gallery">
        {images.map((img, i) => (
          <div key={i} className="gallery-item">
            <img src={img.src} alt={`Снимок ${i + 1}`} className="thumb" />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={img.isPassport}
                onChange={() => togglePassport(i)}
              />
              Паспорт
            </label>
            <button onClick={() => deletePhoto(i)} className="delete-btn">
              ×
            </button>
          </div>
        ))}
      </div>

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
