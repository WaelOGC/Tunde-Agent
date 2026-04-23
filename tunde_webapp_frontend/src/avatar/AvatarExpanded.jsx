import React from "react";

export default function AvatarExpanded({ state, onClose }) {
  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "rgba(0,0,0,0.9)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      flexDirection: "column",
      color: "white"
    }}>
      <h1>{state}</h1>

      <button onClick={onClose} style={{
        marginTop: 20,
        padding: "10px 20px"
      }}>
        Close
      </button>
    </div>
  );
}