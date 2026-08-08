// TEST
"use client";

import { useState } from "react";
import { useTheme } from "@/platform/theme";

export function Navigation() {
  const { theme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100] h-[72px] border-b"
      style={{
        background: "rgba(9, 12, 20, 0.82)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderColor: "rgba(255, 255, 255, 0.08)",
      }}
    >
      <div className="max-w-[1680px] mx-auto px-[40px] h-full flex items-center justify-between">
        {/* Logo Left */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/40 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <svg
              className="w-5 h-5 text-blue-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            TradingCore
          </span>
        </div>

        {/* Centered Navigation Links */}
        <nav className="hidden md:flex items-center space-x-8" aria-label="Main navigation">
          <a
            href="#platform"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Platform
          </a>
          <a
            href="#features"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Pricing
          </a>
          <a
            href="#marketplace"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Marketplace
          </a>
          <a
            href="#developers"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Developers
          </a>
          <a
            href="#resources"
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Resources
            <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </a>
        </nav>

        {/* Right Actions */}
        <div className="hidden md:flex items-center space-x-5">
          <a
            href="#login"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Login
          </a>
          <button
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] hover:bg-blue-500"
            style={{
              background: theme.action.primary.solid || "#2563EB",
            }}
          >
            Get Started Free
          </button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
          aria-expanded={isMobileMenuOpen}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isMobileMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden py-4 px-6 space-y-4 border-b backdrop-blur-xl"
          style={{
            background: "rgba(11, 15, 25, 0.95)",
            borderColor: "rgba(255, 255, 255, 0.08)",
          }}
        >
          <a
            href="#platform"
            className="block text-sm font-medium text-slate-300 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Platform
          </a>
          <a
            href="#features"
            className="block text-sm font-medium text-slate-300 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Features
          </a>
          <a
            href="#pricing"
            className="block text-sm font-medium text-slate-300 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Pricing
          </a>
          <a
            href="#marketplace"
            className="block text-sm font-medium text-slate-300 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Marketplace
          </a>
          <a
            href="#developers"
            className="block text-sm font-medium text-slate-300 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Developers
          </a>
          <a
            href="#resources"
            className="block text-sm font-medium text-slate-300 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Resources
          </a>
          <a
            href="#login"
            className="block text-sm font-medium text-slate-300 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Login
          </a>
          <button
            className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all bg-blue-600 hover:bg-blue-500"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            Get Started Free
          </button>
        </div>
      )}
    </nav>
  );
}
