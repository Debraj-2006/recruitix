
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./ThemeProvider";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import MobileProctor from "./pages/MobileProctor";
import ThreeJsBackground from "@/components/ThreeJsBackground";
import Chatbot from "@/components/Chatbot";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="recruitix-theme">
      <TooltipProvider>
        <ThreeJsBackground />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/mobile-proctor" element={<MobileProctor />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Chatbot />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
