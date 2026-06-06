"use client";
import { useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function ScanQrCode() {
    useEffect(() => {
        const scanner = new Html5Qrcode("reader");

        scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 250 },
            (decodedText) => {
                console.log("Scanned:", decodedText);
            },
            (error) => {
                console.warn(error);
            }
        );

        return () => {
            scanner.stop().then(() => scanner.clear()).catch(console.error);
        };
    }, []);

    return (
        <>
            <div id="reader"></div>

            <div style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "1rem",
                borderTop: "1px solid #333",
                background: "#111",
                display: "flex",
                justifyContent: "center",
                fontFamily: "Arial",
            }}>
                <h2> No Item Found</h2>
            </div>
        </>
    );


} 
