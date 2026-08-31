import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import TeamCapacityPage from "./pages/TeamCapacity";
import CreatorCosts from "./pages/CreatorCosts";
import Pipeline from "./pages/Pipeline";
import Winners from "./pages/Winners";
import Accounts from "./pages/Accounts";
import Movement from "./pages/Movement";
import Partners from "./pages/Partners";
import NewBiz from "./pages/NewBiz";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Index />} />
          <Route path="/ops" element={<TeamCapacityPage />} />
          <Route path="/creator-costs" element={<CreatorCosts />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/movement" element={<Movement />} />
          <Route path="/winners" element={<Winners />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/partners" element={<Partners />} />
          <Route path="/new-biz" element={<NewBiz />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
