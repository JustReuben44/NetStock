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

    return <div id="reader" />;
}
