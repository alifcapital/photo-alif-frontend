// src/App.js
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import ScanPage from "./components/ScanPage";
import ProtectedRoute, { AuthRoute } from "./components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/scan" replace />} />
      <Route
        path="/login"
        element={
          <AuthRoute>
            <Login />
          </AuthRoute>
        }
      />
      <Route
        path="/scan"
        element={
          <ProtectedRoute>
            <ScanPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
