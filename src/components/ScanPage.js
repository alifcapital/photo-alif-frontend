// src/components/ScanPage.js
import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/library";
import "../styles.css";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg","image/png","image/bmp","image/heic","image/heif"];

// QR scanning hook
function useQrScanner(onDetected) {
  const videoRef = useRef();
  const overlayRef = useRef();
  const readerRef = useRef();
  const streamRef = useRef();

  const startScan = useCallback(async () => {
    readerRef.current = new BrowserMultiFormatReader();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const result = await readerRef.current.decodeOnceFromVideoDevice(undefined, videoRef.current);
      onDetected(result.getText());
      // draw and clear overlay omitted for brevity
    } catch (e) { console.error(e); }
  }, [onDetected]);

  const stopScan = useCallback(() => {
    readerRef.current?.reset();
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  return { videoRef, overlayRef, startScan, stopScan };
}

// Viewfinder component
// Viewfinder component
function Viewfinder({ scanning, onStart, videoRef, overlayRef }) {
  return (
    <div className="viewfinder-container">
      {/* Always render video and canvas */}
      <video ref={videoRef} className="video-stream" muted playsInline />
      <canvas ref={overlayRef} className="overlay-canvas" />
      {/* Overlay start button when not scanning */}
      {!scanning && (
        <button className="action-btn start-overlay" onClick={onStart}>
          Начать сканирование QR
        </button>
      )}
    </div>
  );
}
    </div>
  );
}

// Controls component
function Controls({ clientId, onCapture, onReset }) {
  if (!clientId) return null;
  return (
    <div className="controls">
      <p className="scan-success">QR успешно был обработан!</p>
      <div className="btn-group">
        <button className="action-btn" onClick={onCapture}>Сделать фото</button>
        <button className="action-btn" onClick={onReset}>Новый QR</button>
      </div>
    </div>
  );
}

// Gallery component
function Gallery({ images, onToggle, onDelete }) {
  if (images.length === 0) return null;
  return (
    <div className="gallery">
      {images.map((img, i) => (
        <div key={i} className="gallery-item">
          <img src={img.url} alt={`Снимок ${i+1}`} className="thumb" />
          <label className="checkbox-label">
            <input type="checkbox" checked={img.isPassport} onChange={() => onToggle(i)} /> Паспорт
          </label>
          <button className="delete-btn" onClick={() => onDelete(i)}>×</button>
        </div>
      ))}
    </div>
  );
}

export default function ScanPage() {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState(null);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const API = process.env.REACT_APP_API_URL || "";
  const token = localStorage.getItem("authToken");

  const { videoRef, overlayRef, startScan, stopScan } = useQrScanner(text => {
    setClientId(text);
    setScanning(false);
  });

  const handleStart = () => {
  if (scanning) return;
  setScanning(true);
  startScan();
};
  const handleReset = () => { stopScan(); setClientId(null); setImages([]); setScanning(false); };

  const takePhoto = () => {
    const video = videoRef.current;
    const vw = video.videoWidth, vh = video.videoHeight;
    const target = 4/3;
    let w,h,sx,sy;
    if (vw/vh > target) { h=vh; w=vh*target; sx=(vw-w)/2; sy=0; }
    else { w=vw; h=vw/target; sx=0; sy=(vh-h)/2; }
    const c = document.createElement("canvas"); c.width=w; c.height=h;
    c.getContext("2d").drawImage(video,sx,sy,w,h,0,0,w,h);
    c.toBlob(b => b && setImages(p=>[...p,{url:URL.createObjectURL(b),blob:b,isPassport:false}]),"image/jpeg",0.8);
  };
  const togglePassport = i => setImages(p=>p.map((x,j)=>j===i?{...x,isPassport:!x.isPassport}:x));
  const deletePhoto = i => { URL.revokeObjectURL(images[i].url); setImages(p=>p.filter((_,j)=>j!==i)); };

  const uploadAll = async () => {
    setUploading(true);
    const tasks = images.map(({blob,isPassport},i)=>{
      const f=new FormData(); f.append("client_id",clientId); f.append("image",blob);
      f.append("is_passport",isPassport?"1":"0");
      return fetch(`${API}/api/upload-image`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:f})
        .then(r=>({r,i}));
    });
    const res = await Promise.allSettled(tasks);
    // log errors
    res.forEach(r=>r.status!=="fulfilled"||r.value.r.ok||console.error(r));
    alert("Загрузка завершена"); images.forEach(img=>URL.revokeObjectURL(img.url)); setImages([]);
    setUploading(false);
  };

  const handleLogout = () => { fetch(`${API}/api/auth/logout`,{method:"POST",headers:{Authorization:`Bearer ${token}`}}); stopScan(); localStorage.clear(); navigate("/login"); };

  return (
    <div className="scan-page">
      <header className="header">
        <div className="logo">photo.alif.tj</div>
        <button className="logout-btn" onClick={handleLogout}><img src="logout_icon.png" alt="Logout" /></button>
      </header>

      <Viewfinder scanning={scanning} onStart={handleStart} videoRef={videoRef} overlayRef={overlayRef} />
      <Controls clientId={clientId} onCapture={takePhoto} onReset={handleReset} />
      <Gallery images={images} onToggle={togglePassport} onDelete={deletePhoto} />

      {images.length>0 && (
        <div className="controls">
          <button className="action-btn upload-btn" onClick={uploadAll} disabled={uploading}>
            {uploading?"Загрузка...":"Загрузить в папку"}
          </button>
        </div>
      )}
    </div>
  );
}
