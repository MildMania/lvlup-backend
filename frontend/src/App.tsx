import './App.css';
import Layout from './components/Layout';
import { ThemeProvider } from './contexts/ThemeContext';
import { GameProvider } from './contexts/GameContext';

function App() {
  return (
    <ThemeProvider>
      <GameProvider>
        <div className="app">
          <Layout />
        </div>
      </GameProvider>
    </ThemeProvider>
  );
}

export default App;
