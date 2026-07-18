# Task API — JWT + React

An **Express + Prisma** REST API with JWT login, a **PostgreSQL** database,
and a **React** frontend. Users are stored in Prisma, tasks are owned per user,
and the frontend can register, log in, and perform protected CRUD operations.

## Project structure

```
task-api/
├── docker-compose.yml          # defines the api + db containers
├── Dockerfile                  # builds the API image
├── package.json
├── prisma/
│   └── schema.prisma            # User + Task models + DB connection config
├── src/
│   └── index.js                 # Express server with CRUD routes
├── web/
│   └── ...                     # Vite + React frontend
├── .env.example                 # env vars for running the API outside Docker
├── .dockerignore
└── Task-API.postman_collection.json   # import into Postman
```

## Data model

```prisma
model Task {
  id        Int      @id @default(autoincrement())
  title     String
  completed Boolean  @default(false)
  createdAt DateTime @default(now())
   userId    Int
   user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
   id           Int      @id @default(autoincrement())
   email        String   @unique
   name         String?
   passwordHash String
   createdAt    DateTime @default(now())
   tasks        Task[]
}
```

- `id` — primary key, auto-incrementing.
- `title` — required text field.
- `completed` — defaults to `false`.
- `createdAt` — timestamp, set automatically.
- `userId` — owner of the task.

## Auth model

The API seeds one default user on startup and stores all users in Prisma:

- `AUTH_EMAIL` defaults to `admin@task.local`
- `AUTH_PASSWORD` defaults to `password123`
- `JWT_SECRET` signs and verifies access tokens

You can also create users with `POST /auth/register`. After login, include the
returned token as `Authorization: Bearer <token>` on task requests.

## Running it

You need Docker and Docker Compose installed. From the `task-api` directory:

```bash
docker-compose up --build
```

This will:
1. Start a `postgres:16-alpine` container (`task-db`) with a persisted volume.
2. Wait until Postgres reports healthy.
3. Build and start the API container (`task-api`), which pushes the Prisma
   schema to the database, seeds the default user, and then starts listening on
   port `3000`.
4. Build and start the React container (`task-web`) on port `5173`.

Once running, the API is available at `http://localhost:3000` and the frontend
is available at `http://localhost:5173`.

To stop everything:

```bash
docker-compose down
```

To stop and wipe the database volume too:

```bash
docker-compose down -v
```

## API endpoints

| Method | Path          | Description          | Body                                       | Auth |
|--------|---------------|-----------------------|--------------------------------------------|------|
| GET    | `/health`     | Health check          | —                                          | No   |
| POST   | `/auth/register` | Create a user     | `{ "name": "...", "email": "...", "password": "..." }` | No   |
| POST   | `/auth/login` | Exchange credentials  | `{ "email": "...", "password": "..." }` | No   |
| GET    | `/auth/me`    | Read current session  | —                                          | Yes  |
| GET    | `/tasks`      | List all tasks        | —                                          | Yes  |
| GET    | `/tasks/:id`  | Get a single task     | —                                          | Yes  |
| POST   | `/tasks`      | Create a task         | `{ "title": "New task" }`              | Yes  |
| PUT    | `/tasks/:id`  | Update a task         | `{ "title": "...", "completed": true }` | Yes  |
| DELETE | `/tasks/:id`  | Delete a task         | —                                          | Yes  |

Error responses (400/404/500) return JSON: `{ "error": "message" }`.

### Example: create a task with curl

```bash
curl -X POST http://localhost:3000/tasks \
   -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "New task"}'
```

### Example: log in with curl

```bash
curl -X POST http://localhost:3000/auth/login \
   -H "Content-Type: application/json" \
   -d '{"email": "admin@task.local", "password": "password123"}'
```

### Example: list tasks

```bash
curl http://localhost:3000/tasks
```

## Testing with Postman

1. Open Postman → **Import** → select `Task-API.postman_collection.json`.
2. The collection uses `baseUrl`, `taskId`, and `authToken` variables. Run
   **Register** or **Login** first so the token is saved into `authToken`.
3. The task requests already include the `Authorization` header and reuse
   `taskId` for the CRUD flow.
4. Run requests individually, or use **Run collection** to execute them all in
   order.

## React frontend

The frontend lives in `web/` and talks to the API with `VITE_API_URL`.

From a second terminal:

```bash
cd web
npm install
npm run dev
```

If the API is running on a different origin, set `VITE_API_URL` before starting
the frontend.

## Local development without Docker (optional)

If you want to run the API directly on your machine against the Dockerized DB:

```bash
docker-compose up db          # just the database
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm start
```

Then, in another terminal, start the React app from `web/`.

If you want the Docker stack, run `docker-compose up --build` from the project
root. That starts the API, database, and React frontend together.
