// src/components/Login.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles.css";

// Toast-компонент с анимацией
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

export default function Login() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShow] = useState(false);
  const [toast, setToast]       = useState(null);
  const navigate = useNavigate();
  const API      = process.env.REACT_APP_API_URL || "";

  const handleSubmit = async e => {
    e.preventDefault();
    setToast(null);

    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setToast({ message: "Неверный логин или пароль!", type: "error" });
        return;
      }
      const { token, user } = await res.json();
      localStorage.setItem("authToken", token);
      localStorage.setItem("userName", user.name);
      navigate("/scan");
    } catch {
      setToast({ message: "Ошибка сети. Попробуйте ещё раз.", type: "error" });
    }
  };

  return (
    <div className="login-page">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="login-container">
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email..."
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <div className="password-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShow(v => !v)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          <button type="submit" className="submit-btn">
            Вход
          </button>
        </form>
      </div>
    </div>
  );
}
