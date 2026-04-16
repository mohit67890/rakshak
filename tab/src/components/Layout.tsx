/**
 * Raksha Tab — Layout Shell
 *
 * Warm, welcoming navigation with subtle gradient and smooth transitions.
 * Navigation items adapt based on user role (employee vs ICC).
 */

import { type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home24Regular,
  Home24Filled,
  Folder24Regular,
  Folder24Filled,
  BookOpen24Regular,
  BookOpen24Filled,
  Gavel24Regular,
  Gavel24Filled,
} from "@fluentui/react-icons";
import { AnimatePresence, motion } from "framer-motion";
import { useCurrentUser } from "../context/AuthContext";

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  activeIcon: ReactNode;
  iccOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    path: "/",
    label: "Home",
    icon: <Home24Regular />,
    activeIcon: <Home24Filled />,
  },
  {
    path: "/cases",
    label: "My Cases",
    icon: <Folder24Regular />,
    activeIcon: <Folder24Filled />,
  },
  {
    path: "/rights",
    label: "Know Your Rights",
    icon: <BookOpen24Regular />,
    activeIcon: <BookOpen24Filled />,
  },
  {
    path: "/icc",
    label: "ICC Dashboard",
    icon: <Gavel24Regular />,
    activeIcon: <Gavel24Filled />,
    iccOnly: true,
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useCurrentUser();

  const isIcc = user?.role === "icc";

  const currentPath = location.pathname;
  const activeTab = NAV_ITEMS.find((item) => {
    if (item.path === "/") return currentPath === "/";
    return currentPath.startsWith(item.path);
  })?.path ?? "/";

  const visibleItems = NAV_ITEMS.filter((item) => !item.iccOnly || isIcc);

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa]">
      {/* Nav bar — clean, solid, no glass effects */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-5">
          <div className="flex items-center gap-0.5 h-11">
            {/* Logo / brand mark */}
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 mr-5 px-1.5 py-1 rounded-md hover:bg-gray-50 transition-colors"
            >
              <div className="w-6 h-6 rounded-md bg-violet-600 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <span className="text-[13px] font-semibold text-gray-900 hidden sm:inline tracking-tight">Rakshak</span>
            </button>

            {/* Nav items */}
            {visibleItems.map((item) => {
              const isActive = activeTab === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`
                    relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium
                    transition-colors duration-150
                    ${isActive
                      ? "text-gray-900"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                    }
                  `}
                >
                  <span className="w-4 h-4 flex items-center justify-center">
                    {isActive ? item.activeIcon : item.icon}
                  </span>
                  <span className="hidden sm:inline">{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-2.5 right-2.5 h-0.5 bg-gray-900 rounded-full"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
