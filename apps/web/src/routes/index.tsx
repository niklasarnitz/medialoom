import { defaultSystemService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

export async function getSystemHealthData() {
  return defaultSystemService.getHealth();
}

export const fetchSystemHealth = createServerFn({ method: 'GET' }).handler(async () => {
  return getSystemHealthData();
});

export const Route = createFileRoute('/')({
  loader: async () => await fetchSystemHealth(),
  component: HomeComponent,
});

function HomeComponent() {
  const health = Route.useLoaderData();

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
            <strong>Version:</strong> {health.version}
          </li>
          <li style={{ padding: '0.25rem 0' }}>
            <strong>Status:</strong> {health.status}
          </li>
          <li style={{ padding: '0.25rem 0' }}>
            <strong>Database:</strong> {health.database}
          </li>
          <li style={{ padding: '0.25rem 0' }}>
            <strong>Timestamp:</strong> {health.timestamp}
          </li>
        </ul>
      </section>
    </main>
  );
}
