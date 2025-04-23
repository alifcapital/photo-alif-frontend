// src/components/Login.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [showToast, setShowToast] = useState(false);

  const navigate = useNavigate();
  const API = process.env.REACT_APP_API_URL || "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setShowToast(false);

    try {
      // Отправляем запрос логина на свой бэкенд
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        setError("Неверный логин или пароль!");
        setShowToast(true);
        return;
      }

      const { token, user } = await res.json();
      localStorage.setItem("authToken", token);
      localStorage.setItem("userName", user.name);
      navigate("/scan");
    } catch (e) {
      console.error(e);
      setError("Ошибка сети. Попробуйте ещё раз.");
      setShowToast(true);
    }
  };

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  return (
    <div className="login-page">
      <div className="login-container">
        {showToast && <div className="login-toast">{error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="password-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword((v) => !v)}
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
