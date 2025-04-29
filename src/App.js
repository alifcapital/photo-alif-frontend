// src/App.js
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import ScanPage from "./components/ScanPage";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/scan"
        element={
          <ProtectedRoute>
            {" "}
            <ScanPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
