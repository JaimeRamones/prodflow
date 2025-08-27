// Ruta: src/components/LandingPage.js

import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
    // Este componente es autocontenido, con sus propios estilos para no afectar tu app.
    const styles = `
        html { scroll-behavior: smooth; }
        body { font-family: 'Inter', sans-serif; background-color: #0f172a; color: #cbd5e1; }
        .hero-gradient-text { background: linear-gradient(to right, #34d399, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .feature-card { background-color: #1e293b; border: 1px solid #334155; transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .feature-card:hover { transform: translateY(-8px); box-shadow: 0 10px 15px -5px rgba(0, 0, 0, 0.1); }
        .btn-primary { background: linear-gradient(to right, #10b981, #3b82f6); transition: all 0.3s ease; }
        .btn-primary:hover { transform: scale(1.05); box-shadow: 0 0 20px rgba(59, 130, 246, 0.5); }
    `;

    return (
        <div className="antialiased">
            <style>{styles}</style>
            
            <header className="bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-800">
                <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
                    <a href="#hero" className="flex items-center space-x-3">
                        <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAQABAADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigA-                    <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAQABAADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigA-                    <span className="text-xl font-bold text-white">ProdFlow</span>
                    </a>
                    <div className="hidden md:flex items-center space-x-8">
                        <a href="#features" className="text-slate-300 hover:text-white transition-colors">Características</a>
                        <a href="#how-it-works" className="text-slate-300 hover:text-white transition-colors">¿Cómo Funciona?</a>
                        <a href="#roadmap" className="text-slate-300 hover:text-white transition-colors">Hoja de Ruta</a>
                    </div>
                    <Link to="/app" className="btn-primary text-white font-semibold px-6 py-2 rounded-lg shadow-lg">
                        Iniciar Sesión
                    </Link>
                </nav>
            </header>

            <main>
                <section id="hero" className="py-20 md:py-32">
                    <div className="container mx-auto px-6 text-center">
                        <div className="max-w-3xl mx-auto">
                            <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-6">
                                La <span className="hero-gradient-text">Inteligencia de Inventario</span> que tu E-commerce necesita.
                            </h1>
                            <p className="text-lg md:text-xl text-slate-400 mb-10">
                                Automatiza tu stock, optimiza tus precios y sincroniza tus publicaciones en Mercado Libre sin esfuerzo. Concéntrate en vender, nosotros nos encargamos del resto.
                            </p>
                            <Link to="/app" className="btn-primary text-white font-bold px-8 py-4 rounded-lg shadow-xl text-lg">
                                Acceder a la Aplicación
                            </Link>
                        </div>
                    </div>
                </section>

                <section id="features" className="py-20 bg-slate-900/70">
                    <div className="container mx-auto px-6">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl md:text-4xl font-bold text-white">Todo lo que necesitas, en un solo lugar.</h2>
                            <p className="text-slate-400 mt-2">Desde la gestión de proveedores hasta el análisis de la competencia.</p>
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">📦</div>
                                <h3 className="text-xl font-bold text-white mb-2">Inventario Multi-Depósito</h3>
                                <p className="text-slate-400">Consolida el stock de tu depósito propio y el de todos tus proveedores en una sola vista.</p>
                            </div>
                            <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">🔄</div>
                                <h3 className="text-xl font-bold text-white mb-2">Sincronización Automática</h3>
                                <p className="text-slate-400">Actualiza stock y precios en Mercado Libre en tiempo real.</p>
                            </div>
                            <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">🧠</div>
                                <h3 className="text-xl font-bold text-white mb-2">Inteligencia de Precios</h3>
                                <p className="text-slate-400">Define tus márgenes de ganancia y deja que ProdFlow calcule el precio de venta óptimo.</p>
                            </div>
                             <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">📈</div>
                                <h3 className="text-xl font-bold text-white mb-2">Proyección de Demanda</h3>
                                <p className="text-slate-400">Analizamos tu historial de ventas para proyectar tus necesidades de stock futuras.</p>
                            </div>
                             <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">🏷️</div>
                                <h3 className="text-xl font-bold text-white mb-2">Etiquetas Personalizadas</h3>
                                <p className="text-slate-400">Genera hojas de picking optimizadas junto a la etiqueta oficial de Mercado Libre.</p>
                            </div>
                             <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">👑</div>
                                <h3 className="text-xl font-bold text-white mb-2">Análisis de Competencia</h3>
                                <p className="text-slate-400">Monitorea a tus competidores para tomar decisiones estratégicas y ganar en ventas.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="how-it-works" className="py-20">
                     <div className="container mx-auto px-6">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-4xl font-bold text-white">¿Cómo Funciona?</h2>
                            <p className="text-slate-400 mt-2 max-w-2xl mx-auto">Un ciclo de automatización simple y poderoso que conecta todas las partes de tu negocio.</p>
                        </div>
                        <div className="flex flex-col md:flex-row justify-center items-center gap-8 md:gap-0">
                            <div className="text-center max-w-xs p-6 border border-slate-700 rounded-lg bg-slate-800">
                                <div className="text-3xl mb-3">📂</div>
                                <h3 className="font-bold text-white text-lg mb-2">1. Conecta tus Fuentes</h3>
                                <p className="text-sm text-slate-400">Vincula tu cuenta de Mercado Libre y configura la carpeta de Dropbox de tus proveedores.</p>
                            </div>
                            <div className="w-16 h-1 bg-slate-700 md:w-24 md:h-1"></div>
                             <div className="text-center max-w-xs p-6 border border-slate-700 rounded-lg bg-slate-800">
                                <div className="text-3xl mb-3">🤖</div>
                                <h3 className="font-bold text-white text-lg mb-2">2. ProdFlow Procesa</h3>
                                <p className="text-sm text-slate-400">Nuestro motor se activa, lee el stock, lo suma al tuyo y recalcula precios y cantidades.</p>
                            </div>
                            <div className="w-16 h-1 bg-slate-700 md:w-24 md:h-1"></div>
                             <div className="text-center max-w-xs p-6 border border-slate-700 rounded-lg bg-slate-800">
                                <div className="text-3xl mb-3">✅</div>
                                <h3 className="font-bold text-white text-lg mb-2">3. Vende sin Preocupaciones</h3>
                                <p className="text-sm text-slate-400">Tus publicaciones se pausan, activan y actualizan solas. Tu única tarea es gestionar las ventas.</p>
                            </div>
                        </div>
                     </div>
                </section>

                <section id="cta" className="py-20 bg-slate-900/70">
                    <div className="container mx-auto px-6 text-center">
                        <div className="max-w-2xl mx-auto">
                            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">¿Listo para tomar el control de tu inventario?</h2>
                            <p className="text-slate-400 mb-8">Deja de perder tiempo en tareas manuales y empieza a tomar decisiones basadas en datos.</p>
                             <Link to="/app" className="btn-primary text-white font-bold px-8 py-4 rounded-lg shadow-xl text-lg">
                                Ir a mi Panel de Control
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-slate-800">
                <div className="container mx-auto px-6 py-6 text-center text-slate-500 text-sm">
                    <p>&copy; 2025 ProdFlow. Todos los derechos reservados.</p>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
```

---
### **Paso 3: Actualizar tu `App.js` para Usar Rutas**

Finalmente, reemplaza todo el contenido de tu archivo `src/App.js` con esta versión. Este código ahora usa React Router para mostrar la `LandingPage` en la ruta principal (`/`) y tu aplicación ProdFlow en la ruta `/app`.


```javascript
// Ruta: src/App.js

import React, { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Importamos el nuevo componente de la página de inicio
import LandingPage from './components/LandingPage';

// Importaciones de los componentes de tu aplicación
import Dashboard from './components/Dashboard';
import InventoryList from './components/InventoryList';
import ProductEntry from './components/ProductEntry';
import SalesView from './components/SalesView';
import OrdersManagement from './components/OrdersManagement';
import WarehouseView from './components/WarehouseView';
import Kits from './components/Kits';
import MovementHistory from './components/MovementHistory';
import Tools from './components/Tools';
import Integrations from './components/Integrations';
import PublicationsView from './components/PublicationsView';
import LoginScreen from './components/LoginScreen';
import Notification from './components/Notification';
import EditProductModal from './components/EditProductModal';
import ConfirmDeleteModal from './components/ConfirmDeleteModal';
import CreatePublicationModal from './components/CreatePublicationModal';

// Iconos para la barra lateral
import { HomeIcon, ArchiveBoxIcon, ArrowDownOnSquareIcon, ShoppingCartIcon, DocumentTextIcon, BuildingStorefrontIcon, Squares2X2Icon, ClockIcon, WrenchScrewdriverIcon, BoltIcon, DocumentDuplicateIcon, ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';

export const AppContext = createContext();

const AppProvider = ({ children }) => {
    // ... (Todo el contenido de tu AppProvider se mantiene exactamente igual)
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [categories, setCategories] = useState([]);
    const [kits, setKits] = useState([]);
    const [salesOrders, setSalesOrders] = useState([]);
    const [supplierOrders, setSupplierOrders] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [notification, setNotification] = useState({ show: false, message: '', type: '' });

    const showMessage = (message, type = 'info') => {
        setNotification({ show: true, message, type });
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });
        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });
        return () => authListener.subscription.unsubscribe();
    }, []);
    
    const fetchProducts = useCallback(async () => { 
        const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
        if (error) { showMessage('Error al refrescar los productos.', 'error'); } 
        else { setProducts(data || []); }
    }, []);
    const fetchSuppliers = useCallback(async () => { 
        const { data, error } = await supabase.from('suppliers').select('*').order('name', { ascending: true });
        if (error) { showMessage('Error al refrescar los proveedores.', 'error'); }
        else { setSuppliers(data || []); }
    }, []);
    const fetchCategories = useCallback(async () => { 
        const { data, error } = await supabase.from('categories').select('*').order('name', { ascending: true });
        if (error) { showMessage('Error al refrescar las categorías.', 'error'); }
        else { setCategories(data || []); }
    }, []);
    const fetchSalesOrders = useCallback(async () => { 
        if (!session?.user?.id) return;
        const { data, error } = await supabase.from('sales_orders').select(`*, order_items ( * )`).eq('user_id', session.user.id).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar pedidos de venta.', 'error'); } 
        else { setSalesOrders(data || []); }
    }, [session]);
    const fetchSupplierOrders = useCallback(async () => { 
        const { data, error } = await supabase.from('supplier_orders').select(`*`).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar pedidos a proveedor.', 'error'); } 
        else { setSupplierOrders(data || []); }
    }, []);
    const fetchPurchaseOrders = useCallback(async () => { 
        const { data, error } = await supabase.from('purchase_orders').select(`*`).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar órdenes de compra.', 'error'); } 
        else { setPurchaseOrders(data || []); }
    }, []);
    const fetchKits = useCallback(async () => { 
        // La carga de kits está desactivada como pediste
    }, []);

    useEffect(() => {
        if (session) {
            Promise.all([ fetchProducts(), fetchSuppliers(), fetchCategories(), fetchSalesOrders(), fetchSupplierOrders(), fetchPurchaseOrders(), fetchKits() ]);
        }
    }, [session, fetchProducts, fetchSuppliers, fetchCategories, fetchSalesOrders, fetchSupplierOrders, fetchPurchaseOrders, fetchKits]);
    
    const value = { session, loading, showMessage, products, suppliers, categories, kits, salesOrders, supplierOrders, purchaseOrders, notification, setNotification, fetchProducts, fetchSuppliers, fetchCategories, fetchKits, fetchSalesOrders, fetchSupplierOrders, fetchPurchaseOrders };
    
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};


// --- AQUÍ ESTÁ EL CAMBIO PRINCIPAL ---
// El componente App ahora es el enrutador principal
const App = () => (
    <AppProvider>
        <Router>
            <Routes>
                {/* La ruta raíz "/" ahora muestra la página de inicio */}
                <Route path="/" element={<LandingPage />} />
                
                {/* La aplicación principal ahora vive bajo la ruta "/app" */}
                <Route path="/app/*" element={<AppOrchestrator />} />
            </Routes>
        </Router>
    </AppProvider>
);

// Orquestador: Decide si mostrar Login o la App (se mantiene igual)
const AppOrchestrator = () => {
    const { session, loading } = useContext(AppContext);
    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Cargando...</div>;
    }
    return session ? <AppContent /> : <LoginScreen />;
};

// Contenido de la App: Ahora usa las rutas de React Router
const AppContent = () => {
    const { notification, setNotification, fetchProducts } = useContext(AppContext);
    const [productToEdit, setProductToEdit] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState(null);
    const [productToPublish, setProductToPublish] = useState(null);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const handleEdit = (product) => { setProductToEdit(product); setIsEditModalOpen(true); };
    const handlePublish = (product) => { setProductToPublish(product); setIsPublishModalOpen(true); };
    const handleSave = async (editedProduct) => { 
        const { id, ...dataToUpdate } = editedProduct;
        delete dataToUpdate.created_at; 
        const { error } = await supabase.from('products').update(dataToUpdate).eq('id', id);
        if (error) { showMessage(`Error al guardar: ${error.message}`, 'error'); }
        else {
            showMessage("Producto actualizado.", "success");
            setIsEditModalOpen(false);
            await fetchProducts();
        }
    };
    const handleDeleteConfirm = async () => { 
        if (!productToDelete) return;
        const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
        if (error) { showMessage(`Error al eliminar: ${error.message}`, 'error'); }
        else {
            showMessage("Producto eliminado.", "success");
            await fetchProducts();
        }
        setProductToDelete(null);
    };
    const handleLogout = async () => { await supabase.auth.signOut(); };

    const navLinks = [
        { to: "/app", text: "Dashboard", icon: HomeIcon },
        { to: "/app/inventario", text: "Inventario", icon: ArchiveBoxIcon },
        { to: "/app/entrada", text: "Entrada", icon: ArrowDownOnSquareIcon },
        { to: "/app/ventas", text: "Ventas", icon: ShoppingCartIcon },
        { to: "/app/pedidos", text: "Pedidos", icon: DocumentTextIcon },
        { to: "/app/deposito", text: "Depósito", icon: BuildingStorefrontIcon },
        { to: "/app/kits", text: "Kits", icon: Squares2X2Icon },
        { to: "/app/historial", text: "Historial", icon: ClockIcon },
    ];
    const secondaryLinks = [
        { to: "/app/herramientas", text: "Herramientas", icon: WrenchScrewdriverIcon },
        { to: "/app/integraciones", text: "Integraciones", icon: BoltIcon },
        { to: "/app/publicaciones", text: "Publicaciones", icon: DocumentDuplicateIcon },
    ];

    return (
        <div className="bg-gray-900 text-gray-300 min-h-screen">
            {notification.show && <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ show: false, message: '', type: '' })} />}
            
            <aside className="fixed top-0 left-0 z-40 w-64 h-screen bg-gray-800 border-r border-gray-700">
                <div className="h-full px-3 py-4 overflow-y-auto">
                    <div className="flex items-center pl-2.5 mb-5 space-x-3">
                        <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAQABAADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigA-                    <span className="self-center text-xl font-semibold text-white ml-3">ProdFlow</span>
                    </div>
                    <ul className="space-y-2">
                        {navLinks.map(link => (
                            <li key={link.to}>
                                <NavLink to={link.to} className={({ isActive }) => `flex items-center w-full p-2 rounded-lg group ${isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>
                                    <link.icon className="w-6 h-6" />
                                    <span className="ml-3">{link.text}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                    <ul className="pt-4 mt-4 space-y-2 border-t border-gray-700">
                        {secondaryLinks.map(link => (
                            <li key={link.to}>
                                <NavLink to={link.to} className={({ isActive }) => `flex items-center w-full p-2 rounded-lg group ${isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>
                                    <link.icon className="w-6 h-6" />
                                    <span className="ml-3">{link.text}</span>
                                </NavLink>
                            </li>
                        ))}
                         <li>
                            <button onClick={handleLogout} className="flex items-center w-full p-2 text-gray-400 rounded-lg group hover:bg-red-800 hover:text-white">
                                <ArrowLeftOnRectangleIcon className="w-6 h-6" />
                                <span className="ml-3">Cerrar Sesión</span>
                            </button>
                        </li>
                    </ul>
                </div>
            </aside>

            <main className="p-4 sm:ml-64">
                <div className="mt-14">
                    <Routes>
                        <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/inventario" element={<InventoryList onEdit={handleEdit} onDelete={setProductToDelete} onPublish={handlePublish} />} />
                        <Route path="/entrada" element={<ProductEntry />} />
                        <Route path="/ventas" element={<SalesView />} />
                        <Route path="/pedidos" element={<OrdersManagement />} />
                        <Route path="/deposito" element={<WarehouseView />} />
                        <Route path="/kits" element={<Kits />} />
                        <Route path="/historial" element={<MovementHistory />} />
                        <Route path="/herramientas" element={<Tools />} />
                        <Route path="/integraciones" element={<Integrations />} />
                        <Route path="/publicaciones" element={<PublicationsView />} />
                    </Routes>
                </div>
            </main>
            
            {isEditModalOpen && <EditProductModal product={productToEdit} onClose={() => setIsEditModalOpen(false)} onSave={handleSave} />}
            {productToDelete && <ConfirmDeleteModal item={productToDelete} onCancel={() => setProductToDelete(null)} onConfirm={handleDeleteConfirm} itemType="producto" />}
            {isPublishModalOpen && <CreatePublicationModal product={productToPublish} onClose={() => setIsPublishModalOpen(false)} />}
        </div>
    );
}

export default App;
