import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Game from "./pages/Game";
import Login from "./pages/Login";
import Play from "./pages/Play";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route path="/play" element={<Play />} />
      <Route path="/game/:gameId" element={<Game />} />
    </Routes>
  );
}

export default App;
