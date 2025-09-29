import './App.css';

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>LvlUp Analytics Dashboard</h1>
        <p className="subtitle">
          Connect to the backend API to explore retention, engagement, and player journey insights.
        </p>
      </header>

      <section className="grid">
        <article className="card">
          <h2>Retention Overview</h2>
          <p>
            Start by fetching retention cohorts via
            {' '}<code>/api/analytics/enhanced/metrics/retention</code> and render the day 1/3/7 trends.
          </p>
        </article>

        <article className="card">
          <h2>Active Users</h2>
          <p>
            Visualize DAU/WAU/MAU using the active user endpoint, and let filters drive the timeframe.
          </p>
        </article>

        <article className="card">
          <h2>Playtime Metrics</h2>
          <p>
            Combine session duration and per-user counts to highlight stickiness and depth of play.
          </p>
        </article>

        <article className="card">
          <h2>Player Journey</h2>
          <p>
            Build flows for checkpoint CRUD and progression analytics to spot major drop-off points.
          </p>
        </article>
      </section>

      <footer className="app-footer">
        <p>
          Configure <code>.env.local</code> with <code>VITE_API_BASE_URL</code> and <code>VITE_API_KEY</code>
          {' '}to enable live data.
        </p>
      </footer>
    </div>
  );
}

export default App;
