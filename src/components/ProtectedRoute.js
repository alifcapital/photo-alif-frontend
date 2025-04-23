// src/components/ProtectedRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem('authToken');
  // если нет токена — перенаправляем на логин
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
