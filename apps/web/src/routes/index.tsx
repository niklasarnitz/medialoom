import { useState } from 'react';
import { defaultSystemService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

export async function getSystemHealthData() {
  return defaultSystemService.getHealth();
}

export async function getTmdbSettingsData() {
  return defaultSystemService.getTmdbApiKeyMasked();
}

export const fetchSystemHealth = createServerFn({ method: 'GET' }).handler(async () => {
  return getSystemHealthData();
});

export const fetchPageData = createServerFn({ method: 'GET' }).handler(async () => {
  const health = await getSystemHealthData();
  const tmdb = await getTmdbSettingsData();
  return { health, tmdb };
});

export const saveTmdbApiKey = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (typeof data !== 'object' || data === null || !('apiKey' in data)) {
      throw new Error('Invalid payload');
    }
    return { apiKey: String((data as { apiKey: unknown }).apiKey) };
  })
  .handler(async ({ data }) => {
    await defaultSystemService.setTmdbApiKey(data.apiKey);
    const tmdb = await defaultSystemService.getTmdbApiKeyMasked();
    return { success: true, tmdb };
  });

export const Route = createFileRoute('/')({
  loader: async () => await fetchPageData(),
  component: HomeComponent,
});

function HomeComponent() {
  const data = Route.useLoaderData();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [currentTmdb, setCurrentTmdb] = useState(data.tmdb);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;

    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await saveTmdbApiKey({ data: { apiKey: apiKeyInput.trim() } });
      setCurrentTmdb(res.tmdb);
      setApiKeyInput('');
      setStatusMessage('✓ TMDb API key saved successfully in SQLite database.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Error saving API key: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        maxWidth: '800px',
        margin: '0 auto',
      }}
    >
      <h1>MediaLoom</h1>
      <p style={{ fontSize: '1.2rem', color: '#4a5568' }}>
        Headless-first, type-safe media library manager: beets for movies, TV shows, and audiobooks.
      </p>

      {/* System Status Section */}
      <section
        style={{
          marginTop: '2rem',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          backgroundColor: '#f7fafc',
        }}
      >
        <h2 style={{ marginTop: 0 }}>System Status</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ padding: '0.25rem 0' }}>
            <strong>Version:</strong> {data.health.version}
          </li>
          <li style={{ padding: '0.25rem 0' }}>
            <strong>Status:</strong> {data.health.status}
          </li>
          <li style={{ padding: '0.25rem 0' }}>
            <strong>Database:</strong> {data.health.database}
          </li>
          <li style={{ padding: '0.25rem 0' }}>
            <strong>Timestamp:</strong> {data.health.timestamp}
          </li>
        </ul>
      </section>

      {/* TMDb Settings Section */}
      <section
        style={{
          marginTop: '1.5rem',
          padding: '1.5rem',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          backgroundColor: '#ffffff',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Metadata Provider: TMDb Settings</h2>
        <p style={{ color: '#4a5568', fontSize: '0.95rem' }}>
          Configure your TMDb API Read Access Token or API Key. The key is securely persisted in the SQLite database and never logged.
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <strong>Status: </strong>
          {currentTmdb.configured ? (
            <span style={{ color: '#2b6cb0', fontWeight: 'bold' }}>
              Configured ({currentTmdb.maskedKey})
            </span>
          ) : (
            <span style={{ color: '#c53030', fontWeight: 'bold' }}>
              Not Configured
            </span>
          )}
        </div>

        <form onSubmit={handleSaveKey} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label htmlFor="tmdb-key-input" style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
            {currentTmdb.configured ? 'Update TMDb API Key / Token' : 'Enter TMDb API Key / Token'}
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              id="tmdb-key-input"
              type="password"
              placeholder="e.g. eyJhbGci... or 32-character hex key"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                border: '1px solid #cbd5e0',
                borderRadius: '6px',
                fontSize: '0.95rem',
              }}
            />
            <button
              type="submit"
              disabled={isSaving || !apiKeyInput.trim()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: isSaving || !apiKeyInput.trim() ? '#a0aec0' : '#3182ce',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: isSaving || !apiKeyInput.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              {isSaving ? 'Saving...' : 'Save to SQLite'}
            </button>
          </div>
        </form>

        {statusMessage && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: statusMessage.startsWith('✓') ? '#f0fff4' : '#fff5f5',
              border: `1px solid ${statusMessage.startsWith('✓') ? '#9ae6b4' : '#feb2b2'}`,
              borderRadius: '6px',
              color: statusMessage.startsWith('✓') ? '#22543d' : '#9b2c2c',
              fontSize: '0.9rem',
            }}
          >
            {statusMessage}
          </div>
        )}
      </section>
    </main>
  );
}
