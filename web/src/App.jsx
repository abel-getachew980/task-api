import { useEffect, useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const STORAGE_KEY = 'task-api.jwt';

async function apiFetch(path, options = {}, token = '') {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed');
  }

  return payload;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [mode, setMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: 'admin@task.local',
    password: 'password123',
  });
  const [taskTitle, setTaskTitle] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const completedCount = useMemo(
    () => tasks.filter((task) => task.completed).length,
    [tasks],
  );

  async function loadTasks(currentToken) {
    const data = await apiFetch('/tasks', {}, currentToken);
    setTasks(data);
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (!token) {
        if (active) {
          setReady(true);
        }
        return;
      }

      try {
        const me = await apiFetch('/auth/me', {}, token);
        const currentUser = me.user || me;
        if (!active) {
          return;
        }

        setUser(currentUser);
        await loadTasks(token);
      } catch (err) {
        localStorage.removeItem(STORAGE_KEY);
        if (active) {
          setToken('');
          setUser(null);
          setTasks([]);
          setError(err.message);
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, [token]);

  async function submitAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    setError('');

    try {
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const payload =
        mode === 'register'
          ? authForm
          : { email: authForm.email, password: authForm.password };

      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      localStorage.setItem(STORAGE_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
      await loadTasks(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setToken('');
    setUser(null);
    setTasks([]);
    setTaskTitle('');
    setError('');
    setMode('login');
  }

  async function handleCreateTask(event) {
    event.preventDefault();

    const title = taskTitle.trim();
    if (!title) {
      setError('Task title is required.');
      return;
    }

    setTaskLoading(true);
    setError('');

    try {
      const created = await apiFetch(
        '/tasks',
        {
          method: 'POST',
          body: JSON.stringify({ title }),
        },
        token,
      );

      setTasks((current) => [created, ...current]);
      setTaskTitle('');
    } catch (err) {
      setError(err.message);
    } finally {
      setTaskLoading(false);
    }
  }

  async function handleToggleTask(task) {
    setBusyTaskId(task.id);
    setError('');

    try {
      const updated = await apiFetch(
        `/tasks/${task.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ completed: !task.completed }),
        },
        token,
      );

      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleDeleteTask(taskId) {
    setBusyTaskId(taskId);
    setError('');

    try {
      await apiFetch(
        `/tasks/${taskId}`,
        {
          method: 'DELETE',
        },
        token,
      );

      setTasks((current) => current.filter((task) => task.id !== taskId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyTaskId(null);
    }
  }

  const taskCount = tasks.length;

  if (!ready) {
    return (
      <div className="shell shell-loading">
        <div className="panel loading-card">Loading secure workspace...</div>
      </div>
    );
  }

  if (!token) {
    return (
      <main className="shell auth-shell">
        <section className="hero">
          <div className="eyebrow">JWT-secured task manager</div>
          <h1>Task Secure</h1>
          <p>
            Sign in or create an account to manage tasks through the protected API.
          </p>
          <div className="hero-points">
            <span>Bearer token auth</span>
            <span>Protected CRUD</span>
            <span>React frontend</span>
          </div>
        </section>

        <section className="panel auth-panel">
          <div className="auth-header">
            <h2>{mode === 'register' ? 'Create account' : 'Sign in'}</h2>
            <button
              type="button"
              className="ghost-button auth-toggle"
              onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
            >
              {mode === 'register' ? 'Use existing account' : 'Create new account'}
            </button>
          </div>

          <form onSubmit={submitAuth} className="stack">
            {mode === 'register' ? (
              <label>
                <span>Name</span>
                <input
                  value={authForm.name}
                  onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                  type="text"
                  autoComplete="name"
                />
              </label>
            ) : null}
            <label>
              <span>Email</span>
              <input
                value={authForm.email}
                onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                type="email"
                autoComplete="email"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </label>

            {error ? <div className="notice error">{error}</div> : null}

            <button className="primary-button" type="submit" disabled={authLoading}>
              {authLoading
                ? mode === 'register'
                  ? 'Creating account...'
                  : 'Signing in...'
                : mode === 'register'
                ? 'Create account'
                : 'Enter workspace'}
            </button>
            <p className="hint">
              The API seeds a default user from env defaults, and you can also create new
              users here.
            </p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="shell dashboard-shell">
      <header className="topbar panel">
        <div>
          <div className="eyebrow">Authenticated session</div>
          <h1>Task Secure</h1>
          <p>Signed in as {user?.name || user?.email || 'the current user'}</p>
        </div>
        <button className="ghost-button" type="button" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <section className="stats-grid">
        <article className="panel stat-card">
          <span>Total tasks</span>
          <strong>{taskCount}</strong>
        </article>
        <article className="panel stat-card">
          <span>Completed</span>
          <strong>{completedCount}</strong>
        </article>
        <article className="panel stat-card">
          <span>Open</span>
          <strong>{taskCount - completedCount}</strong>
        </article>
      </section>

      <section className="content-grid">
        <form className="panel composer" onSubmit={handleCreateTask}>
          <div>
            <div className="eyebrow">New task</div>
            <h2>Capture what matters next</h2>
          </div>
          <div className="composer-row">
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              type="text"
              placeholder="Write a task title"
              aria-label="Task title"
            />
            <button className="primary-button" type="submit" disabled={taskLoading}>
              {taskLoading ? 'Adding...' : 'Add task'}
            </button>
          </div>
          {error ? <div className="notice error">{error}</div> : null}
        </form>

        <section className="panel list-panel">
          <div className="list-header">
            <div>
              <div className="eyebrow">Protected data</div>
              <h2>Tasks</h2>
            </div>
            <span className="chip">{taskCount} items</span>
          </div>

          <div className="task-list">
            {tasks.length === 0 ? (
              <div className="empty-state">
                No tasks yet. Create one to see the secured CRUD flow in action.
              </div>
            ) : (
              tasks.map((task) => (
                <article key={task.id} className={`task-row ${task.completed ? 'completed' : ''}`}>
                  <button
                    type="button"
                    className="task-toggle"
                    onClick={() => handleToggleTask(task)}
                    disabled={busyTaskId === task.id}
                  >
                    {task.completed ? 'Mark open' : 'Mark done'}
                  </button>
                  <div className="task-body">
                    <strong>{task.title}</strong>
                    <span>#{task.id}</span>
                  </div>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => handleDeleteTask(task.id)}
                    disabled={busyTaskId === task.id}
                  >
                    Delete
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}